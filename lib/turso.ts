import { createClient } from '@libsql/client/web';

type TursoRuntime = {
  TURSO_DATABASE_URL?: string;
  TURSO_AUTH_TOKEN?: string;
  ALLOW_DEV_IDENTITY?: string;
};

function scalar(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint') return value.toString();
  throw new Error('Database returned an unexpected value.');
}

export type WorkspaceRow = {
  data: string;
  revision: number;
};

export type Memory = {
  kind: string;
  content: string;
  createdAt: string;
};

function client(runtime: TursoRuntime) {
  if (!runtime.TURSO_DATABASE_URL || !runtime.TURSO_AUTH_TOKEN) {
    throw new Error('Workspace storage is not configured. Please try again shortly.');
  }
  return createClient({
    url: runtime.TURSO_DATABASE_URL,
    authToken: runtime.TURSO_AUTH_TOKEN,
  });
}

export async function loadWorkspace(runtime: TursoRuntime, userId: string) {
  const result = await client(runtime).execute({
    sql: 'SELECT data, revision FROM workspaces WHERE user_id = ?',
    args: [userId],
  });
  const row = result.rows[0];
  return row
    ? { data: scalar(row.data), revision: Number(row.revision) }
    : null;
}

export async function saveWorkspace(
  runtime: TursoRuntime,
  user: { id: string; email: string | null; name: string | null },
  data: string,
  previousRevision: number | null,
) {
  const db = client(runtime);
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO users (id, email, name, created_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, last_seen_at = excluded.last_seen_at`,
    args: [user.id, user.email, user.name, now, now],
  });
  if (previousRevision === null) {
    await db.execute({
      sql: 'INSERT INTO workspaces (user_id, data, revision, updated_at) VALUES (?, ?, 1, ?)',
      args: [user.id, data, now],
    });
    return 1;
  }
  const result = await db.execute({
    sql: 'UPDATE workspaces SET data = ?, revision = revision + 1, updated_at = ? WHERE user_id = ? AND revision = ?',
    args: [data, now, user.id, previousRevision],
  });
  if (result.rowsAffected !== 1) return null;
  return previousRevision + 1;
}

export async function clearMemories(runtime: TursoRuntime, userId: string) {
  await client(runtime).execute({
    sql: 'DELETE FROM memories WHERE user_id = ?',
    args: [userId],
  });
}

export async function remember(
  runtime: TursoRuntime,
  userId: string,
  kind: string,
  content: string,
) {
  const now = new Date().toISOString();
  await client(runtime).execute({
    sql: `INSERT INTO memories (user_id, kind, content, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, kind) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    args: [userId, kind, content, now, now],
  });
}

export async function memoriesForPrompt(runtime: TursoRuntime, userId: string) {
  const result = await client(runtime).execute({
    sql: 'SELECT kind, content, updated_at FROM memories WHERE user_id = ? ORDER BY updated_at DESC LIMIT 12',
    args: [userId],
  });
  return result.rows.map((row) => ({
    kind: scalar(row.kind),
    content: scalar(row.content),
    createdAt: scalar(row.updated_at),
  }));
}
