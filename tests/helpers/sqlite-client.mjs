import { DatabaseSync } from 'node:sqlite';

/** Executes the production SQL against an isolated in-memory SQLite database. */
export function sqliteClient() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys=ON');
  const execute = async (input) => {
    const sql = typeof input === 'string' ? input : input.sql;
    const args = typeof input === 'string' ? [] : input.args || [];
    const statement = database.prepare(sql);
    if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
      const rows = statement.all(...args);
      return { rows, rowsAffected: Number(database.prepare('SELECT changes() n').get().n) };
    }
    const result = statement.run(...args);
    return { rows: [], rowsAffected: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
  };
  let closed = false;
  const client = {
    execute,
    executeMultiple: async (sql) => database.exec(sql),
    transaction: async () => {
      database.exec('BEGIN IMMEDIATE');
      let settled = false;
      return {
        execute,
        batch: async (statements) => {
          const results = [];
          for (const statement of statements) results.push(await execute(statement));
          return results;
        },
        commit: async () => { database.exec('COMMIT'); settled = true; },
        rollback: async () => { if (!settled) { database.exec('ROLLBACK'); settled = true; } },
        close: () => { if (!settled) { database.exec('ROLLBACK'); settled = true; } },
      };
    },
    batch: async (statements) => {
      const tx = await client.transaction();
      try { const results = await tx.batch(statements); await tx.commit(); return results; }
      catch (error) { await tx.rollback(); throw error; }
    },
    // Store methods may close their injected client. Keep the fixture alive until dispose.
    close: () => {},
    dispose: () => { if (!closed) { database.close(); closed = true; } },
  };
  return client;
}
