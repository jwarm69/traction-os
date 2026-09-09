import { createClient } from '@libsql/client/web';
export type BudgetRuntime = {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  OPENAI_API_KEY?: string;
};
const db = (r: BudgetRuntime) => {
  if (!r.TURSO_DATABASE_URL || !r.TURSO_AUTH_TOKEN)
    throw Error('AI budget storage is unavailable. No request was sent.');
  return createClient({
    url: r.TURSO_DATABASE_URL,
    authToken: r.TURSO_AUTH_TOKEN,
  });
};
export const AI_MODEL = 'gpt-5.4-mini-2026-03-17';
// Conservative reservations: 28k Unicode characters <=112k input bytes for a
// plain request; search allows <=2 tool calls and <=3 400k context passes.
// Verified 2026-09-09: $0.75/M input, $4.50/M output, $0.01/search.
// Output is capped at 3500 tokens. A cushion is retained in settled estimates.
export const reservationMicros = (search: boolean) =>
  search ? 1250000 : 125000;
export async function budgetStatus(r: BudgetRuntime, pool = 'public-beta') {
  if (!r.OPENAI_API_KEY)
    return { enabled: false, limit: 10, used: 0, remaining: 0, held: 0 };
  const c = db(r);
  try {
    const q = await c.execute({
      sql: `SELECT b.limit_micros,COALESCE(SUM(s.amount_micros),0) used,COALESCE(SUM(CASE WHEN s.status!='settled' THEN s.amount_micros ELSE 0 END),0) held FROM ai_budgets b LEFT JOIN ai_spend s ON s.budget_id=b.id WHERE b.id=? GROUP BY b.id`,
      args: [pool],
    });
    if (!q.rows[0]) throw Error('AI spending limit is not configured.');
    const limit = Number(q.rows[0].limit_micros),
      used = Number(q.rows[0].used),
      held = Number(q.rows[0].held);
    return {
      enabled: true,
      limit: limit / 1e6,
      used: used / 1e6,
      remaining: Math.max(0, limit - used) / 1e6,
      held: held / 1e6,
    };
  } finally {
    c.close();
  }
}
export async function reserveAI(
  r: BudgetRuntime,
  userId: string,
  search: boolean,
  pool = 'public-beta',
) {
  const c = db(r),
    id = crypto.randomUUID(),
    amount = reservationMicros(search),
    now = new Date().toISOString(),
    minute = new Date(Date.now() - 60000).toISOString(),
    active = new Date(Date.now() - 180000).toISOString();
  try {
    // One atomic SQLite statement arbitrates concurrent callers before any API spend.
    const q = await c.execute({
      sql: `INSERT INTO ai_spend(id,budget_id,user_id,amount_micros,status,created_at)
      SELECT ?,b.id,?,?,'reserved',? FROM ai_budgets b
      WHERE b.id=? AND b.limit_micros >= ? + COALESCE((SELECT SUM(amount_micros) FROM ai_spend WHERE budget_id=b.id),0)
      AND (SELECT COUNT(*) FROM ai_spend WHERE budget_id=b.id AND user_id=? AND created_at>?) < 3
      AND NOT EXISTS(SELECT 1 FROM ai_spend WHERE budget_id=b.id AND user_id=? AND status='reserved' AND created_at>?)`,
      args: [
        id,
        userId,
        amount,
        now,
        pool,
        amount,
        userId,
        minute,
        userId,
        active,
      ],
    });
    if (q.rowsAffected !== 1)
      throw Error(
        'Shared AI is paused: the budget is too low, another request is running, or your three-per-minute limit was reached. Saved work remains available.',
      );
    return { id, amount };
  } finally {
    c.close();
  }
}
export function usageMicros(
  response: Record<string, unknown>,
  search: boolean,
): { amount: number; input: number; output: number } | null {
  const u = response.usage as
    | { input_tokens?: unknown; output_tokens?: unknown }
    | undefined;
  if (
    !u ||
    !Number.isSafeInteger(u.input_tokens) ||
    !Number.isSafeInteger(u.output_tokens)
  )
    return null;
  const input = Number(u.input_tokens),
    output = Number(u.output_tokens);
  if (input < 0 || output < 0) return null;
  // Ignore cache discounts, reserve both allowed searches, and add a 10% cushion.
  return {
    amount: Math.ceil(
      (input * 0.75 + output * 4.5 + (search ? 20000 : 0)) * 1.1,
    ),
    input,
    output,
  };
}
export async function settleAI(
  r: BudgetRuntime,
  reservation: { id: string; amount: number },
  response: Record<string, unknown> | null,
  search: boolean,
) {
  const c = db(r),
    usage = response ? usageMicros(response, search) : null;
  try {
    if (!usage || usage.amount > reservation.amount) {
      await c.execute({
        sql: "UPDATE ai_spend SET status='uncertain' WHERE id=? AND status='reserved'",
        args: [reservation.id],
      });
      if (usage && usage.amount > reservation.amount) {
        await c.execute(
          "UPDATE ai_budgets SET limit_micros=0 WHERE id='public-beta'",
        );
        throw Error(
          'AI paused because provider usage exceeded its reservation.',
        );
      }
      return;
    }
    await c.execute({
      sql: "UPDATE ai_spend SET status='settled',amount_micros=?,response_id=?,input_tokens=?,output_tokens=? WHERE id=? AND status='reserved'",
      args: [
        usage.amount,
        typeof response?.id === 'string' ? response.id : null,
        usage.input,
        usage.output,
        reservation.id,
      ],
    });
  } finally {
    c.close();
  }
}
