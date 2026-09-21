import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  CodexProcess,
  ComputerUseProcess,
  RunnerHttp,
  validateBaseUrl,
} from '../scripts/runner/client.mjs';

function child({
  account = { account: { type: 'chatgpt' } },
  crash = false,
  complete = true,
  request,
  failed = false,
} = {}) {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.stderr = new EventEmitter();
  const emit = (m) => c.stdout.emit('data', JSON.stringify(m) + '\n');
  c.stdin = {
    writes: [],
    write(line) {
      this.writes.push(line);
      const m = JSON.parse(line);
      if (!m.id) return;
      if (m.method === 'initialize') emit({ id: m.id, result: {} });
      else if (m.method === 'account/read') emit({ id: m.id, result: account });
      else if (m.method === 'config/read')
        emit({ id: m.id, result: { config: {} } });
      else if (m.method === 'thread/start')
        emit({ id: m.id, result: { thread: { id: 't' } } });
      else if (m.method === 'turn/start')
        setImmediate(() => {
          if (crash) return c.emit('exit', 1);
          if (request)
            emit({
              id: 44,
              method: request,
              params: {
                threadId: 't',
                turnId: 'turn',
                itemId: 'i',
                command: 'echo hello',
              },
            });
          if (complete) {
            emit({
              method: 'item/agentMessage/delta',
              params: { delta: 'ok' },
            });
            emit({
              method: 'turn/completed',
              params: {
                threadId: 't',
                turn: {
                  id: 'turn',
                  status: failed ? 'failed' : 'completed',
                  error: failed ? { message: 'nope' } : undefined,
                },
              },
            });
          }
          emit({
            id: m.id,
            result: { turn: { id: 'turn', status: 'inProgress' } },
          });
        });
    },
  };
  c.kill = () => {
    c.emit('exit', null, 'SIGTERM');
    return true;
  };
  return c;
}
const dir = () => mkdtemp(join(tmpdir(), 'traction-runner-'));
const clean = async (d) => rm(d, { recursive: true, force: true });

test('HTTPS and redirect policy', async () => {
  assert.throws(() => validateBaseUrl('http://example.test'), /HTTPS/);
  assert.doesNotThrow(() => validateBaseUrl('http://localhost:3000', true));
  let seen;
  const h = new RunnerHttp('https://x.test', 'tok', {
    fetchImpl: async (_u, i) => {
      seen = i;
      return new Response('', { status: 302 });
    },
  });
  await assert.rejects(h.get('/x'), /Redirect/);
  assert.equal(seen.redirect, 'manual');
});
test('account/read null is rejected', async () => {
  const d = await dir();
  try {
    await assert.rejects(
      new CodexProcess({
        workspace: d,
        spawnImpl: () => child({ account: null }),
      }).run('x'),
      /account|sign in/i,
    );
  } finally {
    await clean(d);
  }
});
test('early turn completion returns agent text', async () => {
  const d = await dir();
  try {
    const result = await new CodexProcess({
      workspace: d,
      spawnImpl: () => child(),
    }).run('x');
    assert.equal(result.text, 'ok');
  } finally {
    await clean(d);
  }
});
test('failed turn status rejects', async () => {
  const d = await dir();
  try {
    await assert.rejects(
      new CodexProcess({
        workspace: d,
        spawnImpl: () => child({ failed: true }),
      }).run('x'),
      /failed|nope/i,
    );
  } finally {
    await clean(d);
  }
});
test('child exit rejects', async () => {
  const d = await dir();
  try {
    const run = new CodexProcess({
      workspace: d,
      spawnImpl: () => child({ complete: false, crash: true }),
    })
      .run('x')
      .catch((e) => e);
    assert.match((await run).message, /exit/i);
  } finally {
    await clean(d);
  }
});
test('approval and unknown requests fail closed', async () => {
  const d = await dir();
  try {
    const calls = [];
    const http = {
      post: async (_r, b) => {
        calls.push(b);
        return b.op === 'heartbeat'
          ? { decisions: [{ requestId: '44', decision: 'approved' }] }
          : {};
      },
    };
    const c = child({
      complete: false,
      request: 'item/commandExecution/requestApproval',
    });
    const p = new CodexProcess({
      workspace: d,
      http,
      jobId: 'j',
      leaseToken: 'l',
      spawnImpl: () => c,
    });
    const run = p.run('x');
    await new Promise((r) => setTimeout(r, 30));
    assert.ok(calls.some((x) => x.op === 'event'));
    c.kill();
    await assert.rejects(run);
  } finally {
    await clean(d);
  }
});

test('computer-use bridge requests approval and returns action history', async () => {
  const d = await dir(),
    previous = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = 'test-key';
  try {
    const c = new EventEmitter();
    c.stdout = new EventEmitter();
    c.stderr = new EventEmitter();
    c.stdin = {
      write(line) {
        const message = JSON.parse(line);
        if (message.goal)
          setImmediate(() =>
            c.stdout.emit(
              'data',
              'TRACTION_JSON:' +
                JSON.stringify({
                  type: 'approval',
                  id: 'action_1',
                  action: { kind: 'click', target: 'Continue' },
                }) +
                '\n',
            ),
          );
        else
          setImmediate(() =>
            c.stdout.emit(
              'data',
              'TRACTION_JSON:' +
                JSON.stringify({
                  type: 'complete',
                  outcome: 'completed',
                  history: ['clicked Continue'],
                }) +
                '\n',
            ),
          );
      },
    };
    c.kill = () => {
      c.emit('exit', null, 'SIGTERM');
      return true;
    };
    const calls = [],
      processRunner = new ComputerUseProcess({
        workspace: d,
        bridge: '/bridge.py',
        jobId: 'job_1',
        leaseToken: 'lease',
        spawnImpl: () => {
          setImmediate(() =>
            c.stdout.emit('data', 'TRACTION_JSON:{"type":"ready"}\n'),
          );
          return c;
        },
        http: {
          post: async (_route, body) => {
            calls.push(body);
            return body.op === 'heartbeat'
              ? {
                  decisions: [
                    {
                      requestId: 'action_1',
                      method: 'computer/action/requestApproval',
                      decision: 'approved',
                    },
                  ],
                }
              : {};
          },
        },
      });
    const result = await processRunner.run('Click Continue');
    assert.deepEqual(result.actions, ['clicked Continue']);
    assert.ok(
      calls.some((call) => call.method === 'computer/action/requestApproval'),
    );
  } finally {
    if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
    else process.env.TYPESAFE_API_KEY = previous;
    await clean(d);
  }
});
