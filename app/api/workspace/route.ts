import {
  listBusinesses,
  importOwnerStarters,
  loadBusiness,
  loadLegacy,
  saveBusiness,
} from '@/lib/turso';
import {
  addLog,
  acceptGuidedProposal,
  agreeGuidedDiagnosis,
  confirmGuidedBrief,
  createRound,
  demoBusiness,
  diagnose,
  ensureGuided,
  guidedDraftMatchesActive,
  invalidateGuidedBrief,
  saveGuidedDraft,
  saveGuidedDecisionDraft,
  setGuidedProposal,
  uid,
  weeklyReview,
  type BriefFieldKey,
  type BusinessDocument,
  type Fact,
} from '@/lib/engine';
import {
  emailAddress,
  encodeMail,
  fetchGA4,
  findSentGmail,
  readGmailThread,
  sendGmail,
  verifyGmail,
} from '@/lib/connections';
import { parseSignalsCsv } from '@/lib/csv';
import { runAI } from '@/lib/ai';
import { budgetStatus } from '@/lib/ai-budget';
import { authenticateRequest, type AuthUser as User } from '@/lib/auth';
import { runtime } from '@/lib/runtime';
const out = (x: unknown, s = 200) =>
  Response.json(x, { status: s, headers: { 'Cache-Control': 'no-store' } });
const txt = (x: unknown, n = 12000) => {
  if (typeof x !== 'string' || x.length > n)
    throw Error('Invalid or oversized text input.');
  return x.trim();
};
const required = (value: unknown, max: number) => {
  const text = txt(value, max);
  if (!text) throw Error('Complete the required fields before continuing.');
  return text;
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Expected a JSON object.');
  return value as Record<string, unknown>;
};
const numeric = (value: unknown) => {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    (typeof value === 'string' && !value.trim()) ||
    !Number.isFinite(Number(value)) ||
    Number(value) < 0
  )
    throw Error(
      'Enter a non-negative numeric value; missing values remain unknown.',
    );
  return Number(value);
};
const confidence = (value: unknown): Fact['confidence'] => {
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  throw Error('Choose a valid confidence level.');
};
const sourceUrl = (value: unknown) => {
  const url = new URL(required(value, 2000));
  if (url.protocol !== 'https:' || url.username || url.password)
    throw Error('Research must include a supporting HTTPS source.');
  return url.href;
};
function legacy(
  raw: string,
  mem: { kind: string; content: string; updatedAt: string }[],
): BusinessDocument {
  const w = JSON.parse(raw) as {
      name: string;
      url: string;
      mode: 'demo' | 'live';
      goal?: string;
      budget?: string;
      notes?: string;
      findings?: {
        label: string;
        value: string;
        source?: string;
        status: Fact['status'];
      }[];
      log?: BusinessDocument['log'];
    },
    now = new Date().toISOString(),
    b: BusinessDocument = {
      version: 2,
      id: uid('biz'),
      name: w.name,
      url: w.url,
      mode: w.mode,
      createdAt: now,
      updatedAt: now,
      goal: w.goal || '',
      budget: w.budget || '',
      notes: w.notes || '',
      facts: (w.findings || []).map((f) => ({
        id: uid('fact'),
        label: f.label,
        value: f.value,
        source: f.source || 'Legacy workspace',
        observedAt: now,
        confidence: 'medium',
        status: f.status,
      })),
      signals: [],
      rounds: [],
      reviews: [],
      outreach: { prospects: [], drafts: [] },
      log: w.log || [],
    };
  for (const m of mem) {
    if (m.kind.startsWith('experiment:'))
      try {
        const e = object(JSON.parse(m.content));
        if (e.result === null || e.result === undefined || e.result === '')
          continue;
        b.signals.push({
          id: uid('sig'),
          metric: required(e.metric, 120),
          value: numeric(e.result),
          period: 'Legacy experiment',
          note: txt(e.learning || '', 1000),
          source: 'Imported legacy experiment',
          observedAt: m.updatedAt,
          confidence: 'high',
        });
      } catch {}
  }
  addLog(b, 'Imported from the previous workspace format.');
  return b;
}
function legacyId(userId: string) {
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(userId)) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `biz_legacy_${(hash >>> 0).toString(16)}`;
}
async function loadOrImport(u: User, id?: string) {
  await importOwnerStarters(runtime(), u);
  const ai = await budgetStatus(runtime());
  let summaries = await listBusinesses(runtime(), u.id);
  if (!summaries.length) {
    const old = await loadLegacy(runtime(), u.id);
    if (old.workspace) {
      const b = legacy(old.workspace, old.memories),
        deterministicId = legacyId(u.id);
      b.id = deterministicId;
      const existing = await loadBusiness(runtime(), u.id, deterministicId);
      if (existing)
        return {
          ai,
          business: JSON.parse(existing.data),
          revision: existing.revision,
          businesses: await listBusinesses(runtime(), u.id),
        };
      await saveBusiness(runtime(), u, b.id, JSON.stringify(b), null);
      summaries = await listBusinesses(runtime(), u.id);
    }
  }
  const chosen = id || summaries[0]?.id;
  if (!chosen)
    return { ai, business: null, revision: 0, businesses: summaries };
  const row = await loadBusiness(runtime(), u.id, chosen);
  return {
    ai,
    business: row ? JSON.parse(row.data) : null,
    revision: row?.revision || 0,
    businesses: summaries,
  };
}
export async function GET(req: Request) {
  const u = await authenticateRequest(runtime(), req);
  if (!u)
    return out(
      { error: 'Sign in to open your businesses.' },
      401,
    );
  try {
    return out(
      await loadOrImport(
        u,
        new URL(req.url).searchParams.get('businessId') || undefined,
      ),
    );
  } catch (e) {
    console.error('load failed', e);
    return out(
      { error: 'Saved business data is temporarily unavailable.' },
      503,
    );
  }
}
export async function POST(req: Request) {
  const u = await authenticateRequest(runtime(), req);
  if (!u)
    return out({ error: 'Sign in to save your work.' }, 401);
  try {
    if (
      req.headers.get('origin') &&
      req.headers.get('origin') !== new URL(req.url).origin
    )
      return out({ error: 'Request origin mismatch.' }, 403);
    const raw = await req.text();
    if (raw.length > 150000) throw Error('Request too large.');
    const x = object(JSON.parse(raw)),
      op = txt(x.op, 40),
      id =
        typeof x.businessId === 'string' ? txt(x.businessId, 100) : undefined;
    if (op === 'create_demo') {
      const b = demoBusiness(),
        rev = await saveBusiness(runtime(), u, b.id, JSON.stringify(b), null);
      return out({ ...(await loadOrImport(u, b.id)), revision: rev });
    }
    if (op === 'create_business') {
      const url = new URL(txt(x.url, 2000));
      if (!['http:', 'https:'].includes(url.protocol))
        throw Error('Enter a valid website URL.');
      const now = new Date().toISOString(),
        key = txt(x.key || '', 500),
        liveAI = !!runtime().OPENAI_API_KEY || !!key;
      let name = txt(x.name || url.hostname, 200),
        facts: Fact[] = [];
      if (liveAI && x.research !== false) {
        const a = await runAI(
          runtime(),
          u.id,
          key,
          `Research ${url.href}. Return {name,facts:[{label,value,source,confidence}]}; 4-8 facts, source must be a supporting https URL and confidence low/medium/high. These facts will be dated with the retrieval date and require owner review.`,
          true,
        );
        name = txt(a.name, 200);
        if (!Array.isArray(a.facts) || a.facts.length < 1 || a.facts.length > 8)
          throw Error('Research did not return usable facts.');
        facts = a.facts.map((value: unknown) => {
          const f = object(value);
          return {
            id: uid('fact'),
            label: required(f.label, 100),
            value: required(f.value, 3000),
            source: sourceUrl(f.source),
            observedAt: now,
            confidence: confidence(f.confidence || 'low'),
            status: 'unreviewed',
          };
        });
      }
      const b: BusinessDocument = {
        version: 2,
        id: uid('biz'),
        name,
        url: url.href,
        mode: 'live',
        createdAt: now,
        updatedAt: now,
        goal: '',
        budget: '',
        notes: '',
        facts,
        signals: [],
        rounds: [],
        reviews: [],
        outreach: { prospects: [], drafts: [] },
        log: [
          {
            text:
              liveAI && x.research !== false
                ? 'Sourced research added for owner review.'
                : 'Business created from owner input.',
            at: now,
          },
        ],
      };
      const rev = await saveBusiness(
        runtime(),
        u,
        b.id,
        JSON.stringify(b),
        null,
      );
      return out({ ...(await loadOrImport(u, b.id)), revision: rev });
    }
    if (op === 'verify_gmail' && !id) {
      const gmail = await verifyGmail(txt(x.gmailToken, 4000));
      return out({ ...(await loadOrImport(u)), gmail });
    }
    if (!id) throw Error('Choose a business first.');
    const row = await loadBusiness(runtime(), u.id, id);
    if (!row) return out({ error: 'Business not found.' }, 404);
    if (x.revision !== row.revision)
      return out(
        {
          error:
            'This business changed in another tab. Reload before continuing.',
        },
        409,
      );
    const b = JSON.parse(row.data) as BusinessDocument;
    if (op === 'save_guided_draft') {
      const fields = object(x.fields);
      const confirmations = object(x.confirmations || {});
      const keys: BriefFieldKey[] = [
        'offer',
        'audience',
        'readiness',
        'objective',
        'resources',
      ];
      saveGuidedDraft(
        b,
        Object.fromEntries(
          keys.map((key) => [key, txt(fields[key] || '', 3000)]),
        ) as Record<BriefFieldKey, string>,
        Object.fromEntries(
          keys.map((key) => [key, confirmations[key] === true]),
        ),
        txt(x.ownerNotes || '', 8000),
      );
    } else if (op === 'save_guided_decision_draft') {
      saveGuidedDecisionDraft(
        b,
        txt(x.hypothesis || '', 2000),
        txt(x.nextObservation || '', 1200),
      );
    } else if (op === 'confirm_guided_brief') {
      if (x.fields) {
        const fields = object(x.fields);
        const confirmations = object(x.confirmations || {});
        const keys: BriefFieldKey[] = ['offer', 'audience', 'readiness', 'objective', 'resources'];
        saveGuidedDraft(
          b,
          Object.fromEntries(keys.map((key) => [key, txt(fields[key] || '', 3000)])) as Record<BriefFieldKey, string>,
          Object.fromEntries(keys.map((key) => [key, confirmations[key] === true])),
          txt(x.ownerNotes || '', 8000),
        );
      }
      confirmGuidedBrief(b);
    } else if (op === 'agree_guided_decision') {
      const flow = ensureGuided(b);
      if (!flow.activeBriefVersionId)
        throw Error('Confirm the business brief first.');
      const signals = b.signals.slice(-8);
      const hasBaseline = signals.length > 0;
      agreeGuidedDiagnosis(b, {
        hypothesis: required(x.hypothesis, 2000),
        evidence: hasBaseline
          ? signals.map(
              (signal) =>
                `${signal.metric}: ${signal.value} (${signal.period}; ${signal.source})`,
            )
          : ['No comparable measured baseline is recorded.'],
        alternatives: Array.isArray(x.alternatives)
          ? x.alternatives.slice(0, 4).map((v) => required(v, 800))
          : ['The constraint may be acquisition, activation, or offer clarity.'],
        nextObservation: required(x.nextObservation, 1200),
        confidence: hasBaseline ? 'medium' : 'low',
        agreedAt: new Date().toISOString(),
      });
    } else if (op === 'propose_guided_experiment') {
      const flow = ensureGuided(b);
      const brief = flow.briefVersions.find(
        (version) => version.id === flow.activeBriefVersionId,
      );
      if (!brief || !flow.diagnosis)
        throw Error('Agree on the brief and uncertainty before planning.');
      if (!guidedDraftMatchesActive(flow))
        throw Error('The business draft changed. Confirm a new brief before using AI to plan.');
      const beforeRevision = row.revision;
      const shape = (a: Record<string, unknown>) => ({
        title: required(a.title, 200),
        uncertainty: required(a.uncertainty, 1000),
        rationale: required(a.rationale, 2000),
        audience: required(a.audience, 1000),
        action: required(a.action, 3000),
        ownerContribution: required(a.ownerContribution, 1200),
        timeWindow: required(a.timeWindow, 300),
        cost: required(a.cost, 300),
        metric: required(a.metric, 500),
        successRule: required(a.successRule, 800),
        stoppingRule: required(a.stoppingRule, 800),
        measurementPlan: required(a.measurementPlan, 1200),
        alternatives: Array.isArray(a.alternatives)
          ? a.alternatives.slice(0, 3).map((v) => required(v, 800))
          : [],
      });
      let proposal;
      if (b.mode === 'demo') {
        proposal = shape({
          title: 'Guided first-value pilot',
          uncertainty: flow.diagnosis.hypothesis,
          rationale:
            'A small guided pilot creates a direct observation before spending on a wider acquisition effort.',
          audience: brief.fields.audience.value,
          action:
            'Invite five eligible people through an owner-controlled channel and guide them through the currently ready workflow.',
          ownerContribution:
            'Confirm the promise, choose the eligible participants, and record completion.',
          timeWindow: '14 days',
          cost: '$0 external spend; within the confirmed owner time',
          metric: 'Eligible participants who reach the confirmed first useful outcome',
          successRule: 'At least 3 of 5 invited participants reach the first useful outcome.',
          stoppingRule:
            'Stop at 14 days, after five completed attempts, or immediately if the promised workflow is unavailable.',
          measurementPlan:
            'Record invited, started, and first-value completed for the same named cohort; missing observations remain unknown.',
          alternatives: [
            'Broad acquisition is deferred until the first-value path is observed.',
          ],
        });
      } else {
        const boundedContext = {
          brief,
          diagnosis: flow.diagnosis,
          signals: b.signals.slice(-8),
          completedExperiments: b.rounds
            .flatMap((round) => round.experiments)
            .filter((experiment) => experiment.status === 'complete')
            .slice(-5)
            .map(({ channel, metric, target, result, learning }) => ({
              channel,
              metric,
              target,
              result,
              learning,
            })),
        };
        const a = await runAI(
          runtime(),
          u.id,
          txt(x.key || '', 500),
          `Propose exactly one smallest useful experiment grounded only in this confirmed brief. Return {title,uncertainty,rationale,audience,action,ownerContribution,timeWindow,cost,metric,successRule,stoppingRule,measurementPlan,alternatives:[string]}. Include denominators and a finite stopping rule. Missing baseline stays unknown. Do not authorize outreach, spending, or external action. Context: ${JSON.stringify(boundedContext)}`,
        );
        const latest = await loadBusiness(runtime(), u.id, id);
        if (!latest || latest.revision !== beforeRevision)
          return out(
            {
              error:
                'The brief changed while the proposal was being prepared. Review it and generate a fresh proposal.',
            },
            409,
          );
        proposal = shape(a);
      }
      setGuidedProposal(b, proposal);
    } else if (op === 'accept_guided_experiment') {
      acceptGuidedProposal(b);
    } else if (op === 'save_context') {
      const update = required(x.update, 4000);
      const notes = [b.notes, update].filter(Boolean).join('\n\n');
      if (notes.length > 16000) throw Error('Your notes are full. Edit your business context to make room before adding more.');
      b.notes = notes;
      delete b.contextDraft;
      invalidateGuidedBrief(b);
      addLog(b, 'Owner update saved to business context.');
    } else if (op === 'organize_context') {
      const a = await runAI(runtime(), u.id, txt(x.key || '', 500),
        `Help the owner understand their business context. Return {summary,questions:[string]}. Summarize in at most 250 words; ask at most 3 specific, useful questions that would change the next growth decision. Distinguish owner statements, unreviewed research and proposed goals. Do not invent or claim completed work. Use only this context: ${JSON.stringify({name:b.name,goal:b.goal,budget:b.budget,notes:b.notes,facts:b.facts.slice(-12),rounds:b.rounds.slice(-2),signals:b.signals.slice(-8)})}`);
      if (!Array.isArray(a.questions) || a.questions.length > 3) throw Error('The assistant returned an invalid set of questions.');
      b.contextDraft = { summary: required(a.summary, 4000), questions: a.questions.map(q => required(q, 500)), generatedAt: new Date().toISOString() };
      addLog(b, 'Assistant summarized saved context and suggested calibration questions.');
    } else if (op === 'update_profile') {
      b.name = required(x.name, 200);
      b.goal = txt(x.goal, 2000);
      b.budget = txt(x.budget, 1000);
      b.notes = txt(x.notes || '', 16000);
      invalidateGuidedBrief(b);
      addLog(b, 'Business direction updated. Existing rounds kept unchanged.');
    } else if (op === 'add_fact') {
      b.facts.push({
        id: uid('fact'),
        label: required(x.label, 100),
        value: required(x.value, 3000),
        source: txt(x.source || 'Owner input', 2000),
        observedAt: new Date().toISOString(),
        confidence: confidence(x.confidence || 'medium'),
        status: 'confirmed',
      });
      invalidateGuidedBrief(b);
      addLog(b, `Owner fact added: ${txt(x.label, 100)}.`);
    } else if (op === 'update_fact') {
      const f = b.facts.find((f) => f.id === x.factId);
      if (!f) throw Error('Fact not found.');
      f.value = required(x.value, 3000);
      f.source = txt(x.source, 2000);
      if (x.status !== 'confirmed' && x.status !== 'corrected')
        throw Error('Choose a valid review state.');
      f.confidence = confidence(x.confidence);
      f.status = x.status;
      f.observedAt = new Date().toISOString();
      invalidateGuidedBrief(b);
      addLog(b, `${f.label} reviewed.`);
    } else if (op === 'add_signal') {
      const v = numeric(x.value);
      b.signals.push({
        id: uid('sig'),
        metric: required(x.metric, 120),
        value: v,
        period: required(x.period, 120),
        note: txt(x.note || '', 1000),
        source: txt(x.source || 'Owner entry', 500),
        observedAt: new Date().toISOString(),
        confidence: confidence(x.confidence || 'medium'),
      });
      addLog(b, `Signal added: ${txt(x.metric, 120)}.`);
    } else if (op === 'import_csv') {
      const imported = parseSignalsCsv(txt(x.csv, 50000));
      if (!imported.length) throw Error('CSV contained no signal rows.');
      const observedAt = new Date().toISOString();
      for (const signal of imported)
        b.signals.push({
          id: uid('sig'),
          ...signal,
          source:
            signal.source ||
            `CSV import: ${txt(x.fileName || 'owner file', 200)}`,
          observedAt,
          confidence: 'medium',
        });
      addLog(
        b,
        `${imported.length} CSV signals imported from ${txt(x.fileName || 'owner file', 200)}.`,
      );
    } else if (op === 'import_ga4') {
      const g = await fetchGA4(
        txt(x.ga4Token, 4000),
        txt(x.propertyId, 100),
        txt(x.startDate, 20),
        txt(x.endDate, 20),
      );
      for (const [metric, value] of Object.entries({
        Sessions: g.sessions,
        'Active users': g.activeUsers,
        'Page views': g.pageViews,
        'GA4 key events': g.keyEvents,
      }))
        b.signals.push({
          id: uid('sig'),
          metric,
          value,
          period: `${g.startDate} to ${g.endDate}`,
          note:
            metric === 'GA4 key events'
              ? `Key events are not assumed to be leads or sales.${g.warnings.length ? ` Connector notes: ${g.warnings.join('; ')}` : ''}`
              : g.warnings.length
                ? `Connector notes: ${g.warnings.join('; ')}`
                : '',
          source: g.source,
          observedAt: new Date().toISOString(),
          confidence: 'high',
        });
      addLog(
        b,
        `GA4 signals imported.${g.warnings.length ? ' Review connector warnings.' : ''}`,
      );
    } else if (op === 'diagnose') diagnose(b);
    else if (op === 'create_round') {
      if (b.mode === 'demo') createRound(b, txt(x.name || '', 120));
      else {
        if (b.rounds.some((r) => r.status !== 'complete'))
          throw Error('Close the current round before creating another.');
        if (
          !b.goal.trim() ||
          !b.budget.trim() ||
          !b.facts.some((f) => f.status !== 'unreviewed')
        )
          throw Error(
            'Set a goal and budget and confirm your business facts before planning.',
          );
        diagnose(b);
        const context = {
          goal: b.goal,
          budget: b.budget,
          notes: b.notes,
          diagnosis: b.diagnosis,
          facts: b.facts.filter((f) => f.status !== 'unreviewed').slice(0, 10),
          signals: b.signals.slice(-20),
          past: b.rounds.slice(-5).map((r) => ({
            name: r.name,
            experiments: r.experiments.map((e) => ({
              channel: e.channel,
              hypothesis: e.hypothesis,
              metric: e.metric,
              target: e.target,
              result: e.result,
              learning: e.learning,
            })),
          })),
        };
        const a = await runAI(
          runtime(),
          u.id,
          txt(x.key || '', 500),
          `Design the next distinct experiment round from this evidence. Return {experiments:[{channel,hypothesis,action,metric,target}]}, 3-8 experiments with positive integer targets, within stated resources. Use past results to avoid blind repetition. Context: ${JSON.stringify(context)}`,
        );
        if (
          !Array.isArray(a.experiments) ||
          a.experiments.length < 3 ||
          a.experiments.length > 8
        )
          throw Error('Planning did not return 3–8 valid experiments.');
        const experiments = a.experiments.map((value: unknown) => {
          const e = object(value);
          const target = numeric(e.target);
          if (!Number.isInteger(target) || target < 1)
            throw Error('Planning returned an invalid target.');
          return {
            channel: txt(e.channel, 200),
            hypothesis: txt(e.hypothesis, 2000),
            action: txt(e.action, 3000),
            metric: txt(e.metric, 200),
            target,
          };
        });
        createRound(b, txt(x.name || '', 120), experiments);
      }
    } else if (op === 'start_experiment') {
      const e = b.rounds
        .flatMap((r) => r.experiments)
        .find((e) => e.id === x.experimentId);
      if (!e || e.status !== 'draft')
        throw Error('Draft experiment not found.');
      const owningRound = b.rounds.find((r) => r.experiments.includes(e));
      if (!owningRound || owningRound.status === 'complete')
        throw Error('A closed round cannot be restarted.');
      if (
        b.rounds
          .flatMap((r) => r.experiments)
          .filter((x) => x.status === 'running').length >= 2
      )
        throw Error('Keep at most two experiments running at once.');
      e.status = 'running';
      e.startedAt = new Date().toISOString();
      const r = b.rounds.find((r) => r.experiments.includes(e))!;
      r.status = 'active';
      addLog(b, `${e.channel} started.`);
    } else if (op === 'record_result') {
      const e = b.rounds
        .flatMap((r) => r.experiments)
        .find((e) => e.id === x.experimentId);
      if (!e || e.status !== 'running')
        throw Error('Running experiment not found.');
      if (x.result === '' || x.result === null || x.result === undefined)
        throw Error('Enter a result.');
      e.result = numeric(x.result);
      if (!Number.isFinite(e.result) || e.result < 0)
        throw Error('Enter a non-negative result.');
      e.evidence = required(x.evidence, 3000);
      e.status = 'complete';
      e.endedAt = new Date().toISOString();
      e.learning = x.learning
        ? txt(x.learning, 3000)
        : e.result >= e.target
          ? 'Target met. Repeat before scaling.'
          : 'Below target. Change one variable in the next round.';
      const r = b.rounds.find((r) => r.experiments.includes(e))!;
      if (r.experiments.every((e) => e.status === 'complete'))
        r.status = 'complete';
      addLog(b, `${e.channel} result recorded.`);
    } else if (op === 'close_round') {
      const r = b.rounds.find((r) => r.id === x.roundId);
      if (!r || r.status === 'complete') throw Error('Open round not found.');
      if (r.experiments.some((e) => e.status === 'running'))
        throw Error(
          'Record running experiment results before closing this round.',
        );
      if (!r.experiments.some((e) => e.status === 'complete'))
        throw Error(
          'Complete at least one experiment before closing this round.',
        );
      r.status = 'complete';
      addLog(
        b,
        `${r.name} closed; unstarted ideas remain recorded as not run.`,
      );
    } else if (op === 'generate_review') weeklyReview(b);
    else if (op === 'discover_prospects') {
      if (b.mode === 'demo')
        throw Error(
          'Live prospect research is unavailable in the fictional demo.',
        );
      const context = {
        goal: b.goal,
        confirmedFacts: b.facts
          .filter((f) => f.status !== 'unreviewed')
          .slice(0, 10),
        diagnosis: b.diagnosis,
      };
      const a = await runAI(
        runtime(),
        u.id,
        txt(x.key || '', 500),
        `Search for 3-5 real organizations matching this audience. Return {prospects:[{name,company,reason,source,email}]}. source must be a supporting https URL. Include email only when explicitly published in the source; otherwise use an empty string. Never infer or guess an address. Context: ${JSON.stringify(context)}`,
        true,
      );
      if (
        !Array.isArray(a.prospects) ||
        a.prospects.length < 3 ||
        a.prospects.length > 5
      )
        throw Error('Research did not return 3–5 usable candidates.');
      for (const value of a.prospects as unknown[]) {
        const candidate = object(value);
        const email = candidate.email
          ? emailAddress(txt(candidate.email, 320))
          : '';
        const company = required(candidate.company, 200);
        if (
          b.outreach.prospects.some(
            (p) =>
              (email && p.email.toLowerCase() === email.toLowerCase()) ||
              p.company.toLowerCase() === company.toLowerCase(),
          )
        )
          continue;
        b.outreach.prospects.push({
          id: uid('prospect'),
          name: required(candidate.name, 200),
          email,
          company,
          reason: required(candidate.reason, 1000),
          source: sourceUrl(candidate.source),
          addedAt: new Date().toISOString(),
          status: 'new',
        });
      }
      addLog(
        b,
        `${a.prospects.length} sourced prospect candidates added for owner review.`,
      );
    } else if (op === 'update_prospect_email') {
      const p = b.outreach.prospects.find((p) => p.id === x.prospectId);
      if (!p || !['new', 'drafted'].includes(p.status))
        throw Error('Prospect cannot be edited now.');
      p.email = emailAddress(txt(x.email, 320));
      addLog(b, `Owner added a contact address for ${p.name}.`);
    } else if (op === 'add_prospect') {
      const email = emailAddress(txt(x.email, 320));
      if (
        b.outreach.prospects.some(
          (p) => p.email.toLowerCase() === email.toLowerCase(),
        )
      )
        throw Error('This email address is already in the prospect list.');
      b.outreach.prospects.push({
        id: uid('prospect'),
        name: required(x.name, 200),
        email,
        company: required(x.company, 200),
        reason: required(x.reason, 1000),
        source: txt(x.source || 'Owner entry', 500),
        addedAt: new Date().toISOString(),
        status: 'new',
      });
      addLog(b, `Prospect added: ${txt(x.name, 200)}.`);
    } else if (op === 'draft_outreach') {
      const p = b.outreach.prospects.find((p) => p.id === x.prospectId);
      if (!p) throw Error('Prospect not found.');
      if (!['new', 'drafted'].includes(p.status))
        throw Error(
          'This prospect cannot be redrafted in its current delivery state.',
        );
      const supportedOffer = b.facts.find(
        (f) =>
          f.status !== 'unreviewed' && /offer|product|service/i.test(f.label),
      )?.value;
      let subject = `A quick question for ${p.company}`,
        body = `Hi ${p.name},\n\nI’m reaching out because ${p.reason}\n\n${supportedOffer ? `${b.name} helps with ${supportedOffer}` : `[Owner: add one accurate sentence about how ${b.name} helps this prospect.]`} Would a short conversation be useful?\n\nBest,\n${b.name}`;
      if (x.key || runtime().OPENAI_API_KEY) {
        const a = await runAI(
          runtime(),
          u.id,
          txt(x.key || '', 500),
          `Return {subject,body}. Draft a concise, truthful one-to-one email. Business evidence: ${JSON.stringify(
            {
              name: b.name,
              goal: b.goal,
              notes: b.notes,
              facts: b.facts
                .filter((f) => f.status !== 'unreviewed')
                .slice(0, 8),
              signals: b.signals.slice(-10),
              pastResults: b.rounds
                .slice(-3)
                .flatMap((r) => r.experiments)
                .filter((e) => e.status === 'complete')
                .slice(-8),
            },
          )}; Prospect: ${JSON.stringify(p)}.`,
        );
        subject = txt(a.subject, 300);
        body = txt(a.body, 5000);
      }
      b.outreach.drafts = b.outreach.drafts.filter(
        (d) => d.prospectId !== p.id,
      );
      b.outreach.drafts.push({
        prospectId: p.id,
        subject,
        body,
        createdAt: new Date().toISOString(),
      });
      p.status = 'drafted';
      addLog(b, `Draft created for ${p.name}; nothing sent.`);
    } else if (op === 'approve_outreach') {
      const p = b.outreach.prospects.find((p) => p.id === x.prospectId),
        d = b.outreach.drafts.find((d) => d.prospectId === x.prospectId);
      if (!p || !d || p.status !== 'drafted')
        throw Error('Only a reviewed draft can be approved.');
      if (!p.email)
        throw Error('Add and review a recipient email before approval.');
      const account =
        b.mode === 'demo'
          ? { email: 'demo-owner@example.com' }
          : await verifyGmail(txt(x.gmailToken, 4000));
      d.subject = required(x.subject, 300);
      d.body = required(x.body, 5000);
      if (/\[Owner:/.test(d.body))
        throw Error(
          'Replace the owner placeholder before approving this message.',
        );
      d.reviewedAt = new Date().toISOString();
      p.status = 'approved';
      p.approvedAt = new Date().toISOString();
      p.messageId = `${crypto.randomUUID()}@traction.local`;
      p.approvedFrom = account.email;
      encodeMail({
        from: account.email,
        to: p.email,
        subject: d.subject,
        body: d.body,
        messageId: p.messageId,
      });
      addLog(b, `Email to ${p.name} approved. It is ready to send.`);
    } else if (op === 'verify_gmail') {
      const v = await verifyGmail(txt(x.gmailToken, 4000));
      return out({ ...(await loadOrImport(u, id)), gmail: v });
    } else if (op === 'sync_replies') {
      const account = await verifyGmail(txt(x.gmailToken, 4000));
      for (const p of b.outreach.prospects.filter(
        (p) => p.threadId && p.sentAt,
      )) {
        if (p.approvedFrom !== account.email) continue;
        const r = await readGmailThread(
          txt(x.gmailToken, 4000),
          p.threadId!,
          p.email,
          p.sentAt!,
        );
        p.replyCount = r.replyCount;
        p.lastReplyAt = r.lastReplyAt;
        p.snippets = r.snippets;
        if (r.replyCount) p.status = 'replied';
      }
      addLog(b, 'Gmail replies checked by owner.');
    } else if (op === 'reconcile_send') {
      const p = b.outreach.prospects.find((p) => p.id === x.prospectId);
      if (!p?.messageId || !['sending', 'uncertain'].includes(p.status))
        throw Error('Only an uncertain send can be reconciled.');
      const account = await verifyGmail(txt(x.gmailToken, 4000));
      if (account.email !== p.approvedFrom)
        throw Error(
          'Reconnect the Gmail account used when this recipient was approved.',
        );
      const found = await findSentGmail(txt(x.gmailToken, 4000), p.messageId);
      if (found) {
        p.gmailId = found.id;
        p.threadId = found.threadId;
        p.sentAt = p.sentAt || p.sendAttemptedAt || new Date().toISOString();
        p.status = 'sent';
      }
      addLog(
        b,
        found
          ? 'Uncertain send reconciled in Gmail.'
          : 'No sent copy found. Delivery remains uncertain; automatic retry is blocked.',
      );
    } else if (op === 'send_approved') {
      if (b.mode === 'demo')
        throw Error('Fictional demo outreach cannot be sent.');
      const p = b.outreach.prospects.find((p) => p.id === x.prospectId),
        d = b.outreach.drafts.find((d) => d.prospectId === x.prospectId);
      if (!p || !d || p.status !== 'approved' || !p.messageId)
        throw Error('This email needs explicit approval first.');
      const account = await verifyGmail(txt(x.gmailToken, 4000));
      if (account.email !== p.approvedFrom)
        throw Error(
          'Reconnect the Gmail account used when this recipient was approved.',
        );
      p.status = 'sending';
      p.sendAttemptedAt = new Date().toISOString();
      addLog(b, `Sending approved email to ${p.name}.`);
      const pre = await saveBusiness(
        runtime(),
        u,
        id,
        JSON.stringify(b),
        row.revision,
      );
      if (pre === null)
        return out({ error: 'This business changed in another tab.' }, 409);
      try {
        const sent = await sendGmail(txt(x.gmailToken, 4000), {
          from: account.email,
          to: p.email,
          subject: d.subject,
          body: d.body,
          messageId: p.messageId,
        });
        p.gmailId = sent.id;
        p.threadId = sent.threadId;
        p.sentAt = p.sendAttemptedAt;
        p.status = 'sent';
        addLog(b, `Approved email sent to ${p.name}.`);
      } catch {
        p.status = 'uncertain';
        p.error =
          'Delivery could not be confirmed. Reconcile in Gmail before trying again.';
        addLog(
          b,
          `Send outcome for ${p.name} is uncertain; automatic retry blocked.`,
        );
      }
      const final = await saveBusiness(
        runtime(),
        u,
        id,
        JSON.stringify(b),
        pre,
      );
      if (final === null)
        return out(
          {
            error:
              'Delivery finished, but its receipt could not be saved. Reload before doing anything else.',
          },
          409,
        );
      return out({ ...(await loadOrImport(u, id)), revision: final });
    } else throw Error('Unknown action.');
    const data = JSON.stringify(b);
    if (data.length > 500000)
      throw Error(
        'This business record is too large. Export and trim older raw data.',
      );
    const rev = await saveBusiness(runtime(), u, id, data, row.revision);
    if (rev === null)
      return out(
        { error: 'Another action finished first. Reload to see it.' },
        409,
      );
    return out({ ...(await loadOrImport(u, id)), revision: rev });
  } catch (e) {
    console.error('operation failed', e);
    return out(
      {
        error:
          e instanceof Error ? e.message : 'Could not complete this action.',
      },
      400,
    );
  }
}
