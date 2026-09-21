import assert from 'node:assert/strict';
import test from 'node:test';
import { demoBusiness } from '../lib/engine.ts';
import {
  MAX_CONTACTS,
  MAX_NAME,
  MAX_NOTE,
  MIN_DENOMINATOR,
  addContact,
  canMoveContact,
  contactFor,
  moveContact,
  pipelineChannels,
  pipelineStages,
  pipelineState,
  pipelineSummary,
  reachedStage,
  removeContact,
  reopenContact,
} from '../lib/pipeline.ts';

const owner = (over = {}) => ({
  name: 'Dana Reyes',
  channel: 'email',
  source: 'owner',
  ...over,
});

await test('the stage and channel vocabularies are fixed and ordered', () => {
  assert.deepEqual(pipelineStages, [
    'identified',
    'contacted',
    'replied',
    'conversation',
    'won',
    'lost',
  ]);
  assert.deepEqual(pipelineChannels, [
    'email',
    'social',
    'community',
    'referral',
    'other',
  ]);
});

await test('pipelineState is empty and non-destructive before anything is added', () => {
  const business = demoBusiness();
  assert.deepEqual(pipelineState(business).contacts, []);
  assert.equal(business.pipeline, undefined);
});

await test('addContact records an identified contact with history and a log entry', () => {
  const business = demoBusiness();
  const logBefore = business.log.length;
  const contact = addContact(business, owner({ organization: 'Reyes Studio' }));
  assert.equal(contact.stage, 'identified');
  assert.equal(contact.source, 'owner');
  assert.equal(contact.organization, 'Reyes Studio');
  assert.equal(contact.stageHistory.length, 1);
  assert.equal(contact.stageHistory[0].stage, 'identified');
  assert.equal(contact.createdAt, contact.updatedAt);
  assert.equal(pipelineState(business).contacts.length, 1);
  assert.equal(business.log.length, logBefore + 1);
  assert.equal(contactFor(business, contact.id).id, contact.id);
  assert.throws(() => contactFor(business, 'missing'), /not found/);
});

await test('contact input is validated and bounded', () => {
  const business = demoBusiness();
  assert.throws(() => addContact(business, owner({ name: '   ' })), /required/);
  assert.throws(
    () => addContact(business, owner({ name: 'a'.repeat(MAX_NAME + 1) })),
    /120 characters/,
  );
  assert.throws(
    () => addContact(business, owner({ organization: 'o'.repeat(MAX_NAME + 1) })),
    /120 characters/,
  );
  assert.throws(
    () => addContact(business, owner({ note: 'n'.repeat(MAX_NOTE + 1) })),
    /500 characters/,
  );
  assert.throws(() => addContact(business, owner({ channel: 'fax' })), /channel/);
  assert.throws(() => addContact(business, owner({ source: 'robot' })), /source/);
  assert.throws(() => addContact(business, owner({ stage: 'nowhere' })), /stage/);
  // A name of exactly the limit is fine.
  const edge = addContact(business, owner({ name: 'a'.repeat(MAX_NAME) }));
  assert.equal(edge.name.length, MAX_NAME);
});

await test('routes must be https and are otherwise omitted', () => {
  const business = demoBusiness();
  assert.throws(
    () => addContact(business, owner({ route: 'http://example.com/contact' })),
    /https/,
  );
  assert.throws(() => addContact(business, owner({ route: 'example.com' })), /https/);
  assert.throws(
    () => addContact(business, owner({ route: 'javascript:alert(1)' })),
    /https/,
  );
  const withRoute = addContact(
    business,
    owner({ route: ' https://example.com/contact ' }),
  );
  assert.equal(withRoute.route, 'https://example.com/contact');
  const without = addContact(business, owner({ route: '  ' }));
  assert.equal('route' in without, false);
});

await test('an assistant may only create identified contacts, because drafts are not outcomes', () => {
  const business = demoBusiness();
  assert.throws(
    () => addContact(business, owner({ source: 'assistant', stage: 'contacted' })),
    /start at identified/,
  );
  const contact = addContact(business, owner({ source: 'assistant' }));
  assert.equal(contact.stage, 'identified');
});

await test('an owner may start further along but never at a resolved stage', () => {
  const business = demoBusiness();
  const started = addContact(business, owner({ stage: 'contacted', note: 'Emailed today.' }));
  assert.equal(started.stage, 'contacted');
  assert.equal(started.stageHistory[0].note, 'Emailed today.');
  for (const stage of ['won', 'lost']) {
    assert.throws(() => addContact(business, owner({ stage })), /cannot be created/);
  }
});

await test('the pipeline is capped at 500 contacts', () => {
  const business = demoBusiness();
  for (let index = 0; index < MAX_CONTACTS; index += 1)
    addContact(business, owner({ name: `Contact ${index}` }));
  assert.equal(pipelineState(business).contacts.length, MAX_CONTACTS);
  assert.throws(() => addContact(business, owner()), /at most 500/);
});

await test('canMoveContact allows one step forward, lost from anywhere, and nothing backwards', () => {
  assert.equal(canMoveContact('identified', 'contacted'), true);
  assert.equal(canMoveContact('contacted', 'replied'), true);
  assert.equal(canMoveContact('replied', 'conversation'), true);
  assert.equal(canMoveContact('conversation', 'won'), true);
  // No skipping ahead.
  assert.equal(canMoveContact('identified', 'replied'), false);
  assert.equal(canMoveContact('identified', 'won'), false);
  assert.equal(canMoveContact('contacted', 'conversation'), false);
  // Lost from anywhere unresolved.
  for (const stage of ['identified', 'contacted', 'replied', 'conversation'])
    assert.equal(canMoveContact(stage, 'lost'), true);
  // No moving backwards.
  assert.equal(canMoveContact('replied', 'contacted'), false);
  assert.equal(canMoveContact('won', 'conversation'), false);
  // Resolved stages are terminal.
  for (const stage of pipelineStages) {
    assert.equal(canMoveContact('won', stage), false);
    assert.equal(canMoveContact('lost', stage), false);
  }
});

await test('moveContact walks an owner contact to won and records every step', () => {
  const business = demoBusiness();
  const contact = addContact(business, owner());
  moveContact(business, contact.id, 'contacted');
  moveContact(business, contact.id, 'replied', 'Replied by email.');
  moveContact(business, contact.id, 'conversation');
  const won = moveContact(business, contact.id, 'won', 'Signed up.');
  assert.equal(won.stage, 'won');
  assert.deepEqual(
    won.stageHistory.map((event) => event.stage),
    ['identified', 'contacted', 'replied', 'conversation', 'won'],
  );
  assert.equal(won.stageHistory[2].note, 'Replied by email.');
  assert.equal('note' in won.stageHistory[1], false);
  assert.ok(won.updatedAt >= won.createdAt);
  assert.equal(reachedStage(won, 'contacted'), true);
  assert.equal(reachedStage(won, 'lost'), false);
});

await test('moveContact rejects invalid, repeated, skipped and backwards transitions', () => {
  const business = demoBusiness();
  const contact = addContact(business, owner());
  assert.throws(() => moveContact(business, 'missing', 'contacted'), /not found/);
  assert.throws(() => moveContact(business, contact.id, 'nowhere'), /Unknown pipeline stage/);
  assert.throws(() => moveContact(business, contact.id, 'identified'), /already at that stage/);
  assert.throws(() => moveContact(business, contact.id, 'replied'), /cannot move/);
  moveContact(business, contact.id, 'contacted');
  assert.throws(() => moveContact(business, contact.id, 'identified'), /cannot move/);
  moveContact(business, contact.id, 'lost', 'No fit.');
  assert.throws(() => moveContact(business, contact.id, 'contacted'), /cannot move/);
});

await test('an assistant-sourced contact needs a note to claim anything happened', () => {
  const business = demoBusiness();
  const contact = addContact(business, owner({ source: 'assistant' }));
  assert.throws(() => moveContact(business, contact.id, 'contacted'), /needs a note/);
  assert.throws(() => moveContact(business, contact.id, 'contacted', '   '), /needs a note/);
  assert.throws(
    () => moveContact(business, contact.id, 'contacted', 'n'.repeat(MAX_NOTE + 1)),
    /500 characters/,
  );
  const moved = moveContact(business, contact.id, 'contacted', 'Sent on 2026-09-21.');
  assert.equal(moved.stage, 'contacted');
  assert.equal(moved.stageHistory[1].note, 'Sent on 2026-09-21.');
  assert.throws(() => moveContact(business, contact.id, 'replied'), /needs a note/);
  assert.throws(() => moveContact(business, contact.id, 'lost'), /needs a note/);
});

await test('reopenContact is the only way back to identified and it requires a reason', () => {
  const business = demoBusiness();
  const contact = addContact(business, owner());
  assert.throws(() => reopenContact(business, contact.id, 'x'), /already at identified/);
  moveContact(business, contact.id, 'contacted');
  moveContact(business, contact.id, 'lost', 'Went quiet.');
  assert.throws(() => reopenContact(business, contact.id, '  '), /required/);
  assert.throws(
    () => reopenContact(business, contact.id, 'r'.repeat(MAX_NOTE + 1)),
    /500 characters/,
  );
  const reopened = reopenContact(business, contact.id, 'They came back in.');
  assert.equal(reopened.stage, 'identified');
  assert.equal(reopened.stageHistory.at(-1).note, 'They came back in.');
  // History is kept, so the earlier outcome is still inspectable.
  assert.equal(reachedStage(reopened, 'lost'), true);
  // And the ladder can be walked again.
  moveContact(business, contact.id, 'contacted');
  assert.equal(contactFor(business, contact.id).stage, 'contacted');
});

await test('removeContact takes the contact out and logs it', () => {
  const business = demoBusiness();
  const a = addContact(business, owner({ name: 'A' }));
  const b = addContact(business, owner({ name: 'B' }));
  const removed = removeContact(business, a.id);
  assert.equal(removed.id, a.id);
  assert.deepEqual(
    pipelineState(business).contacts.map((contact) => contact.id),
    [b.id],
  );
  assert.throws(() => removeContact(business, a.id), /not found/);
});

await test('pipelineSummary counts by stage and channel', () => {
  const business = demoBusiness();
  assert.deepEqual(pipelineSummary(business), {
    total: 0,
    byStage: {
      identified: 0,
      contacted: 0,
      replied: 0,
      conversation: 0,
      won: 0,
      lost: 0,
    },
    byChannel: { email: 0, social: 0, community: 0, referral: 0, other: 0 },
    contacted: 0,
    replied: 0,
    resolved: 0,
    won: 0,
    lost: 0,
    replyRate: null,
    winRate: null,
  });

  addContact(business, owner({ name: 'A', channel: 'email' }));
  addContact(business, owner({ name: 'B', channel: 'social' }));
  const c = addContact(business, owner({ name: 'C', channel: 'email' }));
  moveContact(business, c.id, 'contacted');
  const summary = pipelineSummary(business);
  assert.equal(summary.total, 3);
  assert.equal(summary.byStage.identified, 2);
  assert.equal(summary.byStage.contacted, 1);
  assert.equal(summary.byChannel.email, 2);
  assert.equal(summary.byChannel.social, 1);
  assert.equal(summary.contacted, 1);
});

await test('rates are unknown, not zero, while the denominator is under five', () => {
  const business = demoBusiness();
  // Four contacted, none replied: a reply rate of 0 would be a claim we cannot make.
  for (let index = 0; index < MIN_DENOMINATOR - 1; index += 1) {
    const contact = addContact(business, owner({ name: `Contact ${index}` }));
    moveContact(business, contact.id, 'contacted');
  }
  const short = pipelineSummary(business);
  assert.equal(short.contacted, 4);
  assert.equal(short.replied, 0);
  assert.equal(short.replyRate, null);
  assert.notEqual(short.replyRate, 0);
  assert.equal(short.winRate, null);
});

await test('reply rate and win rate appear once there is enough evidence', () => {
  const business = demoBusiness();
  const contacts = [];
  for (let index = 0; index < 10; index += 1) {
    const contact = addContact(business, owner({ name: `Contact ${index}` }));
    moveContact(business, contact.id, 'contacted');
    contacts.push(contact);
  }
  // Five of ten reply.
  for (const contact of contacts.slice(0, 5))
    moveContact(business, contact.id, 'replied');
  // Of those five, two reach a conversation and are won; three are lost.
  for (const contact of contacts.slice(0, 2)) {
    moveContact(business, contact.id, 'conversation');
    moveContact(business, contact.id, 'won', 'Agreed.');
  }
  for (const contact of contacts.slice(2, 5))
    moveContact(business, contact.id, 'lost', 'Declined.');

  const summary = pipelineSummary(business);
  assert.equal(summary.total, 10);
  assert.equal(summary.contacted, 10);
  assert.equal(summary.replied, 5);
  assert.equal(summary.won, 2);
  assert.equal(summary.lost, 3);
  assert.equal(summary.resolved, 5);
  assert.equal(summary.replyRate, 0.5);
  assert.equal(summary.winRate, 2 / 5);
  assert.equal(summary.byStage.won, 2);
  assert.equal(summary.byStage.lost, 3);
  assert.equal(summary.byStage.contacted, 5);
});

await test('a contacted count survives the contact moving on, so rates use history not current stage', () => {
  const business = demoBusiness();
  for (let index = 0; index < 5; index += 1) {
    const contact = addContact(business, owner({ name: `Contact ${index}` }));
    moveContact(business, contact.id, 'contacted');
    moveContact(business, contact.id, 'replied');
  }
  const summary = pipelineSummary(business);
  assert.equal(summary.byStage.contacted, 0);
  assert.equal(summary.contacted, 5);
  assert.equal(summary.replied, 5);
  assert.equal(summary.replyRate, 1);
});
