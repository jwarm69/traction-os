import type {
  ArtifactVersion,
  BusinessDocument,
  Endeavor,
  EvidenceBar,
  MemoVerdict,
  SkillId,
  WorkArtifact,
  WorkObservation,
} from './engine.ts';
import { campaignRow, campaignTable, type CampaignRow } from './campaigns.ts';
import { endeavorFor, workState } from './work.ts';

/**
 * The run record: for one campaign, what went in, what came out, what the
 * owner changed, and what was learned. Derived from stored records at read
 * time, never stored, never sent to a model. Pure.
 */

export type RunRecordEntry = {
  /** ExecutionRun id, runner-job:<id> for imported runner results, or version:<id> for a generated draft. */
  runId: string;
  route: 'in_app' | 'runner' | 'draft';
  skillId?: SkillId;
  startedAt: string;
  finishedAt?: string;
  status: 'succeeded' | 'failed' | 'running';
  instruction: string;
  contextRevision?: number;
  artifactId?: string;
  artifactTitle?: string;
  assistantVersion?: number;
  /** Owner versions saved on the artifact after this output and before the next assistant output. */
  ownerVersionsAfter: number;
  /** Lines added plus lines removed between this output and the owner's last edit of it; null without an owner edit. */
  changedLines: number | null;
  /** Standing corrections the owner saved from this output. */
  correctionsSaved: string[];
  nextDecision?: string;
  error?: string;
};

export type RunRecord = {
  endeavorId: string;
  code: string;
  title: string;
  kind: Endeavor['kind'];
  status: Endeavor['status'];
  /** The process before Traction: the source idea or proposal as selected. */
  origin: string;
  playbook?: string;
  evidenceBar?: EvidenceBar;
  entries: RunRecordEntry[];
  observations: WorkObservation[];
  memoDecisions: { weekKey: string; verdict: MemoVerdict; note?: string; decidedAt: string }[];
  /** actualEffort as written. Free text, so never summed or compared. */
  effort: string[];
  row: CampaignRow;
};

export const routeLabels: Record<RunRecordEntry['route'], string> = {
  in_app: 'In-app run',
  runner: 'Desktop runner',
  draft: 'Generated draft',
};

const MAX_DIFF_LINES = 2000;

/** Lines added plus lines removed, by longest common subsequence. Long inputs are truncated. */
export function changedLineCount(before: string, after: string) {
  const a = before.split('\n').slice(0, MAX_DIFF_LINES);
  const b = after.split('\n').slice(0, MAX_DIFF_LINES);
  let previous: number[] = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = Array.from({ length: b.length + 1 }, () => 0);
    for (let j = 1; j <= b.length; j += 1)
      current[j] =
        a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
    previous = current;
  }
  const common = previous[b.length];
  return a.length - common + (b.length - common);
}

/** Owner edits and corrections that followed one assistant version, up to the next assistant version. */
function followUp(business: BusinessDocument, artifact: WorkArtifact, version: ArtifactVersion) {
  const later = artifact.versions.filter((item) => item.number > version.number);
  const nextAssistant = later.find((item) => item.source === 'assistant');
  const owner = later.filter(
    (item) => item.source === 'owner' && (!nextAssistant || item.number < nextAssistant.number),
  );
  const until = nextAssistant?.createdAt;
  const corrections = (business.corrections || [])
    .filter(
      (item) =>
        item.fromArtifactId === artifact.id &&
        item.createdAt >= version.createdAt &&
        (!until || item.createdAt < until),
    )
    .map((item) => item.text);
  const lastOwner = owner.at(-1);
  return {
    ownerVersionsAfter: owner.length,
    changedLines: lastOwner ? changedLineCount(version.content, lastOwner.content) : null,
    correctionsSaved: corrections,
  };
}

function playbookName(endeavor: Endeavor) {
  const match = endeavor.sourceIdeaSnapshot?.ownerNotes?.match(/^Started from the (.+?) playbook\./);
  return match?.[1];
}

export function runRecord(business: BusinessDocument, endeavorId: string, now = Date.now()): RunRecord {
  const endeavor = endeavorFor(business, endeavorId);
  const entries: RunRecordEntry[] = [];
  const claimed = new Set<string>();
  const artifactFor = (id?: string) => endeavor.artifacts.find((item) => item.id === id);

  for (const run of endeavor.executionRuns || []) {
    const artifact = artifactFor(run.artifactId);
    const version = artifact?.versions
      .filter(
        (item) =>
          item.source === 'assistant' &&
          item.createdAt >= run.startedAt &&
          (!run.finishedAt || item.createdAt <= run.finishedAt),
      )
      .at(-1);
    if (version) claimed.add(version.id);
    entries.push({
      runId: run.id,
      route: 'in_app',
      ...(run.skillId ? { skillId: run.skillId } : {}),
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      status: run.status,
      instruction: run.instruction,
      contextRevision: run.contextRevision,
      artifactId: artifact?.id,
      artifactTitle: artifact?.title,
      assistantVersion: version?.number,
      ...(artifact && version
        ? followUp(business, artifact, version)
        : { ownerVersionsAfter: 0, changedLines: null, correctionsSaved: [] }),
      nextDecision: run.nextDecision,
      error: run.error,
    });
  }

  for (const artifact of endeavor.artifacts) {
    const runner = artifact.sourceEvidence?.find((item) => item.startsWith('runner-job:'));
    for (const version of artifact.versions) {
      if (version.source !== 'assistant' || claimed.has(version.id)) continue;
      const fromRunner = !!runner && version.number === 1;
      entries.push({
        runId: fromRunner ? runner : `version:${version.id}`,
        route: fromRunner ? 'runner' : 'draft',
        startedAt: version.createdAt,
        finishedAt: version.createdAt,
        status: 'succeeded',
        instruction: '',
        artifactId: artifact.id,
        artifactTitle: artifact.title,
        assistantVersion: version.number,
        ...followUp(business, artifact, version),
      });
    }
  }
  entries.sort((a, z) => z.startedAt.localeCompare(a.startedAt));

  const memoDecisions = (business.memos || [])
    .flatMap((memo) =>
      memo.lines
        .filter((line) => line.endeavorId === endeavorId && line.decision)
        .map((line) => ({ weekKey: memo.weekKey, ...line.decision! })),
    )
    .sort((a, z) => z.weekKey.localeCompare(a.weekKey));

  const idea = endeavor.sourceIdeaSnapshot;
  const origin = idea
    ? [idea.description, idea.audience && `Audience: ${idea.audience}.`, idea.outcome && `Intended outcome: ${idea.outcome}.`]
        .filter(Boolean)
        .join(' ')
    : endeavor.description;

  return {
    endeavorId,
    code: endeavor.code,
    title: endeavor.title,
    kind: endeavor.kind,
    status: endeavor.status,
    origin,
    playbook: playbookName(endeavor),
    evidenceBar: endeavor.evidenceBar?.setAt ? endeavor.evidenceBar : undefined,
    entries,
    observations: endeavor.observations,
    memoDecisions,
    effort: endeavor.observations.map((item) => item.actualEffort.trim()).filter(Boolean),
    row: campaignRow(business, endeavorId, undefined, now),
  };
}

const day = (at: string) => at.slice(0, 10);
const quote = (text: string) => text.replace(/\n+/g, ' ').trim();
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function barText(bar: EvidenceBar) {
  const limits = [
    bar.maxSpend !== undefined && `spend ${bar.maxSpend}`,
    bar.maxDays !== undefined && `${bar.maxDays} days`,
    bar.maxContacts !== undefined && `${bar.maxContacts} contacted`,
  ].filter(Boolean);
  return `win at ${bar.successTarget} ${bar.successMetric}; stop judging at ${limits.join(' or ')}${bar.revisedAt ? ` (changed after start on ${day(bar.revisedAt)})` : ''}`;
}

function entryLines(entry: RunRecordEntry, heading = '###') {
  const lines = [
    `${heading} ${day(entry.startedAt)} · ${routeLabels[entry.route]} · ${entry.status}`,
    '',
  ];
  if (entry.skillId) lines.push(`- Skill: ${entry.skillId.replace('_', ' ')}`);
  if (entry.instruction) lines.push(`- Instruction: ${quote(entry.instruction)}`);
  if (entry.contextRevision !== undefined) lines.push(`- Context revision: ${entry.contextRevision}`);
  if (entry.artifactTitle)
    lines.push(`- Output: ${entry.artifactTitle}${entry.assistantVersion ? ` (version ${entry.assistantVersion})` : ''}`);
  lines.push(
    entry.changedLines === null
      ? '- Owner edits: none recorded'
      : `- Owner edits: ${plural(entry.ownerVersionsAfter, 'version')}, ${plural(entry.changedLines, 'line')} changed`,
  );
  for (const correction of entry.correctionsSaved) lines.push(`- Correction saved: ${quote(correction)}`);
  if (entry.nextDecision) lines.push(`- Proposed next decision: ${quote(entry.nextDecision)}`);
  if (entry.error) lines.push(`- Error: ${quote(entry.error)}`);
  lines.push('');
  return lines;
}

type NumberKey = 'spend' | 'leads' | 'qualified' | 'deals' | 'revenue' | 'churned' | 'costPerConversation';
const numbers: [NumberKey, string][] = [
  ['spend', 'Spend'],
  ['leads', 'Leads'],
  ['qualified', 'Qualified'],
  ['deals', 'Deals'],
  ['revenue', 'Revenue'],
  ['churned', 'Churned'],
  ['costPerConversation', 'Cost per conversation'],
];

function resultLines(row: CampaignRow) {
  const lines = [
    `- Contacts: ${row.contacts} (${row.contacted} contacted, ${row.replied} replied, ${row.conversations} conversations, ${row.won} won, ${row.lost} lost)`,
  ];
  for (const [key, label] of numbers) {
    const value = row[key];
    lines.push(`- ${label}: ${value === null ? 'unknown' : String(value)}`);
  }
  lines.push(`- Last evidence: ${row.lastEvidenceAt ? day(row.lastEvidenceAt) : 'none'}${row.stale ? ' (stale)' : ''}`);
  return lines;
}

/** One campaign's run record as Markdown. */
export function renderRunRecord(record: RunRecord) {
  const lines = [
    `# Run record: ${record.code} ${record.title}`,
    '',
    `Kind: ${record.kind}. Status: ${record.status.replace('_', ' ')}.${record.playbook ? ` Started from the ${record.playbook} playbook.` : ''}`,
    '',
    record.evidenceBar ? `Evidence bar: ${barText(record.evidenceBar)}.` : 'Evidence bar: not set.',
    '',
    '## Runs',
    '',
  ];
  if (!record.entries.length) lines.push('No runs or generated drafts yet.', '');
  for (const entry of record.entries) lines.push(...entryLines(entry));
  lines.push('## Observations', '');
  if (!record.observations.length) lines.push('None recorded.', '');
  for (const item of record.observations)
    lines.push(
      `- ${day(item.observedAt)}: ${quote(item.summary)}${item.verdict ? ` Verdict: ${item.verdict}.` : ''} Next: ${quote(item.nextDecision)}`,
    );
  if (record.observations.length) lines.push('');
  lines.push('## Memo decisions', '');
  if (!record.memoDecisions.length) lines.push('None recorded.', '');
  for (const item of record.memoDecisions)
    lines.push(`- ${item.weekKey}: ${item.verdict}${item.note ? ` — ${quote(item.note)}` : ''}`);
  if (record.memoDecisions.length) lines.push('');
  lines.push('## Effort as recorded', '');
  lines.push(
    record.effort.length
      ? record.effort.map((item) => `- ${quote(item)}`).join('\n')
      : 'None recorded.',
    '',
    'Effort is listed as written. It is free text, so it is not totalled or compared.',
    '',
    '## Results',
    '',
    ...resultLines(record.row),
    '',
  );
  return lines.join('\n');
}

/**
 * A case-study draft for one business, in the shape the 90-day roadmap ends
 * with: process before, the system, the runs, the changes, the results.
 */
export function renderCaseStudy(business: BusinessDocument, now = Date.now()) {
  const records = workState(business)
    .endeavors.filter((item) => item.status !== 'preparing' || item.artifacts.length)
    .map((item) => runRecord(business, item.id, now));
  const routes = new Set(records.flatMap((record) => record.entries.map((entry) => entry.route)));
  const playbooks = [...new Set(records.map((record) => record.playbook).filter(Boolean))];
  const corrections = business.corrections || [];
  const lines = [
    `# Case study draft: ${business.name}`,
    '',
    'Prepared tests are labeled as prepared. Measured results come from the campaign table and carry its unknowns. Nothing here attributes an outcome to a campaign causally, and publishing any of it needs actual records and permission.',
    '',
    '## The process before',
    '',
    ...(records.length
      ? records.map((record) => `- ${record.code} ${record.title}: ${quote(record.origin)}`)
      : ['No campaigns yet.']),
    '',
    '## The system',
    '',
    `- Routes used: ${routes.size ? [...routes].map((route) => routeLabels[route]).join(', ') : 'none yet'}`,
    `- Playbooks used: ${playbooks.length ? playbooks.join(', ') : 'none'}`,
    `- Standing corrections in force: ${corrections.length}`,
    `- Campaigns with an evidence bar: ${records.filter((record) => record.evidenceBar).length} of ${records.length}`,
    '',
    '## The runs and the changes',
    '',
  ];
  for (const record of records) {
    const edited = record.entries.filter((entry) => entry.changedLines !== null);
    lines.push(
      `### ${record.code} ${record.title}`,
      '',
      `Runs and drafts: ${record.entries.length}. Edited by the owner: ${edited.length}. Corrections saved: ${record.entries.reduce((sum, entry) => sum + entry.correctionsSaved.length, 0)}.`,
      '',
      ...record.entries.flatMap((entry) => entryLines(entry, '####')),
    );
  }
  lines.push('## The results', '');
  for (const record of records) {
    lines.push(
      `### ${record.code} ${record.title} (${record.status.replace('_', ' ')})`,
      '',
      record.evidenceBar ? `Evidence bar: ${barText(record.evidenceBar)}.` : 'Evidence bar: not set.',
      ...resultLines(record.row),
      ...record.memoDecisions.map(
        (item) => `- Memo ${item.weekKey}: ${item.verdict}${item.note ? ` — ${quote(item.note)}` : ''}`,
      ),
      '',
    );
  }
  lines.push(
    '## Effort',
    '',
    'Owner effort is listed per campaign in each run record as written. It is not totalled or compared with the process before.',
    '',
  );
  return lines.join('\n');
}

const csvColumns: [keyof CampaignRow, string][] = [
  ['code', 'code'],
  ['title', 'title'],
  ['status', 'status'],
  ['kind', 'kind'],
  ['spend', 'spend'],
  ['contacts', 'contacts'],
  ['contacted', 'contacted'],
  ['replied', 'replied'],
  ['conversations', 'conversations'],
  ['won', 'won'],
  ['lost', 'lost'],
  ['leads', 'leads'],
  ['qualified', 'qualified'],
  ['deals', 'deals'],
  ['revenue', 'revenue'],
  ['churned', 'churned'],
  ['costPerConversation', 'cost_per_conversation'],
  ['costPerDeal', 'cost_per_deal'],
  ['lastEvidenceAt', 'last_evidence_at'],
  ['stale', 'stale'],
];

/** RFC 4180 quoting, with a leading apostrophe on text that a spreadsheet would run as a formula. */
function csvCell(value: string | number | boolean | null) {
  if (value === null) return '';
  let text = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The campaign table as CSV, one row per campaign with the code as the join
 * key. Unknown is an empty cell, never 0.
 */
export function campaignTableCsv(business: BusinessDocument, now = Date.now()) {
  const rows = campaignTable(business, undefined, now);
  return [
    csvColumns.map(([, header]) => header).join(','),
    ...rows.map((row) =>
      csvColumns.map(([key]) => csvCell(row[key] as string | number | boolean | null)).join(','),
    ),
  ].join('\r\n') + '\r\n';
}
