'use client';

import { useState } from 'react';
import { Check, Clapperboard, Copy, Download, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { BusinessDocument, CampaignAsset, Endeavor, RenderFormat } from '@/lib/engine';
import { assetTable, assetTableCsv, buildRenderSpec, registerMotionAsset, type AssetRow } from '@/lib/assets';
import { campaignLink } from '@/lib/work';
import { downloadText, fileSlug } from './run-record-panel';

type Act = (op: string, extra?: Record<string, unknown>) => Promise<boolean>;

export function downloadSpec(b: BusinessDocument, endeavorId: string, name: string) {
  const spec = buildRenderSpec(b, endeavorId, name);
  downloadText(`${name}.render.json`, `${JSON.stringify(spec, null, 2)}\n`, 'application/json');
}

const money = (value: number | null) =>
  value === null ? 'unknown' : value.toLocaleString(undefined, { maximumFractionDigits: 2 });

function Numbers({ row }: { row?: AssetRow }) {
  if (!row) return null;
  return (
    <p className="small asset-numbers" title={row.unknowns.join(' ')}>
      Spend {money(row.spend)} · Leads {row.leads ?? 'unknown'} · Qualified {row.qualified ?? 'unknown'} · Deals{' '}
      {row.deals ?? 'unknown'} · Cost per lead {money(row.costPerLead)}
    </p>
  );
}

function AssetCard({
  b,
  endeavor,
  asset,
  row,
  act,
  busy,
}: {
  b: BusinessDocument;
  endeavor: Endeavor;
  asset: CampaignAsset;
  row?: AssetRow;
  act: Act;
  busy: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [mediaUrl, setMediaUrl] = useState(asset.mediaUrl || '');
  const [publishedUrl, setPublishedUrl] = useState(asset.publishedUrl || '');
  const [copied, setCopied] = useState(false);
  let link = '';
  try {
    link = campaignLink(b.url, endeavor.code, 'video', asset.name);
  } catch {
    link = '';
  }
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return (
    <li className="asset-card">
      <div className="asset-head">
        <code>{asset.name}</code>
        <span className="small muted">
          {asset.kind === 'motion'
            ? `Motion · ${asset.formats?.join(', ') || '9:16'}${asset.hook ? ' · alternate hook' : ''}`
            : 'Made elsewhere'}
        </span>
      </div>
      <Numbers row={row} />
      <div className="asset-actions">
        {asset.kind === 'motion' && (
          <Button size="sm" variant="outline" onClick={() => downloadSpec(b, endeavor.id, asset.name)}>
            <Download size={14} /> Render spec
          </Button>
        )}
        {link && (
          <Button size="sm" variant="ghost" onClick={copyLink} title={link}>
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Tracked link'}
          </Button>
        )}
        {asset.publishedUrl && (
          <a className="small" href={asset.publishedUrl} target="_blank" rel="noreferrer">
            Published <ExternalLink size={12} />
          </a>
        )}
        {asset.mediaUrl && (
          <a className="small" href={asset.mediaUrl} target="_blank" rel="noreferrer">
            File <ExternalLink size={12} />
          </a>
        )}
        <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}>
          {editing ? 'Close' : 'Links'}
        </Button>
      </div>
      {editing && (
        <div className="asset-links">
          <Input value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="Rendered file (https)" />
          <Input value={publishedUrl} onChange={(event) => setPublishedUrl(event.target.value)} placeholder="Where it was published (https)" />
          <Button
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (await act('set_asset_links', { endeavorId: endeavor.id, name: asset.name, mediaUrl, publishedUrl }))
                setEditing(false);
            }}
          >
            Save links
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * Every tracked video in a campaign with its own results. A result counts
 * toward a video only when it names that video's asset.
 */
export default function VideosPanel({
  b,
  endeavor,
  act,
  busy,
}: {
  b: BusinessDocument;
  endeavor: Endeavor;
  act: Act;
  busy: boolean;
}) {
  const [external, setExternal] = useState('');
  const assets = endeavor.assets || [];
  const rows = assetTable(b, endeavor.id);
  const unassigned = rows.find((row) => row.kind === 'unassigned');
  return (
    <div className="work-section videos-panel">
      <div className="run-record-head">
        <h3>Videos</h3>
        {assets.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadText(`${fileSlug(`${endeavor.code} videos`)}.csv`, assetTableCsv(b, endeavor.id), 'text/csv')
            }
          >
            <Download size={14} /> CSV
          </Button>
        )}
      </div>
      <p className="small muted">
        Each video has its own name, used as the file name, the link’s utm_content, and the asset on results. Export a
        render spec from a brief concept, or register a video made elsewhere. Results count toward a video only when they
        name it.
      </p>
      {assets.length > 0 ? (
        <ul className="asset-list">
          {assets.map((asset) => (
            <AssetCard
              key={asset.name}
              b={b}
              endeavor={endeavor}
              asset={asset}
              row={rows.find((row) => row.name === asset.name)}
              act={act}
              busy={busy}
            />
          ))}
        </ul>
      ) : (
        <p className="small muted">No videos yet.</p>
      )}
      {unassigned && (
        <div className="asset-unassigned">
          <strong className="small">Not assigned to a video</strong>
          <Numbers row={unassigned} />
        </div>
      )}
      <div className="inline-add">
        <Input
          value={external}
          maxLength={80}
          onChange={(event) => setExternal(event.target.value)}
          placeholder={`Register a video made elsewhere, e.g. ugc-creator-1 (saved as ${endeavor.code}_…)`}
        />
        <Button
          size="sm"
          disabled={busy || !external.trim()}
          onClick={async () => {
            if (await act('add_asset', { endeavorId: endeavor.id, name: external })) setExternal('');
          }}
        >
          Register
        </Button>
      </div>
    </div>
  );
}

const formatOptions: RenderFormat[] = ['9:16', '1:1', '4:5', '16:9'];

/**
 * Export a render spec for one brief concept: registers the next versioned
 * motion asset, then downloads its spec once the saved record comes back.
 */
export function ExportSpecForm({
  b,
  endeavor,
  briefArtifactId,
  index,
  act,
  busy,
}: {
  b: BusinessDocument;
  endeavor: Endeavor;
  briefArtifactId: string;
  index: number;
  act: Act;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [formats, setFormats] = useState<RenderFormat[]>(['9:16']);
  const [hook, setHook] = useState('');
  const [ctaText, setCtaText] = useState('');
  const exported = (endeavor.assets || []).filter(
    (item) => item.concept?.briefArtifactId === briefArtifactId && item.concept.index === index,
  );
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Clapperboard size={14} /> Render spec{exported.length ? ` (${exported.length})` : ''}
      </Button>
    );
  return (
    <div className="export-spec">
      <fieldset className="export-spec-formats">
        <legend className="small">Formats</legend>
        {formatOptions.map((format) => (
          <label key={format} className="small">
            <input
              type="checkbox"
              checked={formats.includes(format)}
              onChange={(event) =>
                setFormats(event.target.checked ? [...formats, format] : formats.filter((item) => item !== format))
              }
            />{' '}
            {format}
          </label>
        ))}
      </fieldset>
      <Input value={hook} maxLength={200} onChange={(event) => setHook(event.target.value)} placeholder="Alternate hook to test (optional)" />
      <Input value={ctaText} maxLength={60} onChange={(event) => setCtaText(event.target.value)} placeholder="Call to action, e.g. Try it free" />
      <div className="evidence-bar-actions">
        <Button
          size="sm"
          disabled={busy || !formats.length}
          onClick={async () => {
            const input = { briefArtifactId, index, formats, hook, ctaText };
            if (await act('register_asset', { endeavorId: endeavor.id, ...input })) {
              // Registration is deterministic, so replaying it on a copy yields
              // the same asset the server saved, and the same spec.
              const copy = structuredClone(b);
              const asset = registerMotionAsset(copy, endeavor.id, input);
              downloadSpec(copy, endeavor.id, asset.name);
              setOpen(false);
              setHook('');
            }
          }}
        >
          Export v{Math.max(0, ...exported.map((item) => item.version || 0)) + 1}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      <p className="small muted">Each export is a new named version, so two cuts of one concept can be compared.</p>
    </div>
  );
}
