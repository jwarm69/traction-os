'use client';

import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BusinessDocument } from '@/lib/engine';
import { renderRunRecord, routeLabels, runRecord } from '@/lib/run-record';

/** Save text the browser already holds as a file. Nothing is uploaded. */
export function downloadText(filename: string, content: string, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const fileSlug = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'export';

/** What went in, what came out, what the owner changed, per run. Derived; no model. */
export default function RunRecordPanel({ b, endeavorId }: { b: BusinessDocument; endeavorId: string }) {
  const record = runRecord(b, endeavorId);
  return (
    <div className="work-section run-record">
      <div className="run-record-head">
        <h3>Run record</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            downloadText(`${fileSlug(`${record.code} run record`)}.md`, renderRunRecord(record))
          }
        >
          <Download size={14} /> Download
        </Button>
      </div>
      <p className="small muted">
        Every AI output on this campaign and what you changed afterward. The edit count is how much of each draft you
        rewrote; corrections are the rules you saved from it.
      </p>
      {!record.entries.length ? (
        <p className="small muted">No runs or generated drafts yet.</p>
      ) : (
        <ol className="run-record-list">
          {record.entries.map((entry) => (
            <li key={entry.runId} className={`run-record-entry ${entry.status}`}>
              <div>
                <strong>
                  {routeLabels[entry.route]}
                  {entry.skillId ? ` · ${entry.skillId.replace('_', ' ')}` : ''}
                </strong>{' '}
                <small className="muted">
                  {new Date(entry.startedAt).toLocaleString()} · {entry.status}
                </small>
              </div>
              {entry.artifactTitle && (
                <p className="small">
                  {entry.artifactTitle}
                  {entry.assistantVersion ? ` · v${entry.assistantVersion}` : ''}
                </p>
              )}
              {entry.instruction && <p className="small muted">“{entry.instruction}”</p>}
              <p className="small">
                {entry.changedLines === null
                  ? 'Not edited by you yet.'
                  : `You saved ${entry.ownerVersionsAfter} version${entry.ownerVersionsAfter === 1 ? '' : 's'}, ${entry.changedLines} line${entry.changedLines === 1 ? '' : 's'} changed.`}
                {entry.correctionsSaved.length > 0 &&
                  ` ${entry.correctionsSaved.length} correction${entry.correctionsSaved.length === 1 ? '' : 's'} saved.`}
              </p>
              {entry.error && <p className="execution-error small">{entry.error}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
