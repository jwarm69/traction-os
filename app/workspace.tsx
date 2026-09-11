'use client';
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  Activity,
  BarChart3,
  Building2,
  Check,
  ChevronRight,
  Database,
  FlaskConical,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { BusinessDocument, Fact } from '@/lib/engine';
import { ownerQueue } from '@/lib/owner-queue';
import GuidedWorkspace from './guided-workspace';
import ExploreWorkspace from './explore-workspace';
import DoWorkspace from './do-workspace';
import PortfolioWorkspace from './portfolio-workspace';
type Summary = {
  id: string;
  name: string;
  url: string;
  mode: string;
  revision: number;
  updatedAt: string;
  portfolio?: BusinessDocument['portfolio'];
  workSummary?: {
    total: number;
    active: number;
    blocked: number;
    latestObservation?: string;
  };
};
type Res = {
  ai?: {
    enabled: boolean;
    limit: number;
    used: number;
    remaining: number;
    held: number;
  };
  business: BusinessDocument | null;
  businesses: Summary[];
  revision: number;
  error?: string;
  gmail?: { email: string };
  warning?: string;
};
type Act = (op: string, extra?: Record<string, unknown>) => Promise<boolean>;
type FormState = Record<string, string>;
type SetForm = Dispatch<SetStateAction<FormState>>;
export default function Workspace({ username }: { username: string }) {
  const inFlight = useRef(false);
  const [notice, setNotice] = useState('');
  const [aiBudget, setAiBudget] = useState<Res['ai']>();
  const [b, setB] = useState<BusinessDocument | null>(null),
    [businesses, setBusinesses] = useState<Summary[]>([]),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [tab, setTab] = useState('explore'),
    [key, setKey] = useState(''),
    [gmailToken, setGmail] = useState(''),
    [ga4Token, setGa4] = useState(''),
    [form, setForm] = useState<Record<string, string>>({}),
    [showNew, setShowNew] = useState(false),
    [gmailAccount, setGmailAccount] = useState('');
  const accept = (d: Res) => {
    setAiBudget(d.ai);
    setB(d.business);
    setBusinesses(d.businesses || []);
    setRevision(d.revision || 0);
    if (d.business) {
      const url = new URL(window.location.href);
      url.searchParams.set('businessId', d.business.id);
      window.history.replaceState(null, '', url);
    }
  };
  useEffect(() => {
    const selected = new URL(window.location.href).searchParams.get('businessId');
    fetch('/api/workspace' + (selected ? '?businessId=' + encodeURIComponent(selected) : ''))
      .then(async (r) => {
        const d = (await r.json()) as Res;
        if (!r.ok) throw Error(d.error);
        return d;
      })
      .then(accept)
      .catch((e) => setError(e.message));
  }, []);
  async function act(op: string, extra: Record<string, unknown> = {}) {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(op);
    setError('');
    setNotice('');
    try {
      const r = await fetch('/api/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            op,
            businessId: b?.id,
            revision,
            key,
            gmailToken,
            ga4Token,
            ...extra,
          }),
        }),
        d: Res = await r.json();
      if (!r.ok) throw Error(d.error || 'Could not finish.');
      if (d.gmail) setGmailAccount(d.gmail.email);
      accept(d);
      if (op === 'create_business' || op === 'create_demo') {
        setShowNew(false);
        setTab('explore');
        setForm({});
      }
      setNotice(d.warning || (op === 'save_context' ? 'Business update saved. Future plans will use this context.' : op === 'organize_context' ? 'Your context summary is ready below.' : 'Saved to your business.'));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finish.');
      return false;
    } finally {
      inFlight.current = false;
      setBusy('');
    }
  }
  async function select(id: string) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy('select');
    try {
      const response = await fetch(
        `/api/workspace?businessId=${encodeURIComponent(id)}`,
      );
      const d: Res = await response.json();
      if (!response.ok) throw Error(d.error || 'Could not switch businesses.');
      accept(d);
      setForm({});
      setShowNew(false);
      setError('');
      setNotice('');
      setTab('explore');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch businesses.');
    } finally {
      inFlight.current = false;
      setBusy('');
    }
  }
  const queue = b ? ownerQueue(b) : [];
  return (
    <div className="owner-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Activity size={20} />
          </span>
          Traction OS
        </div>
        <div className="top-actions">
          <span className="private">{username}</span>
          <span className="private">
            {aiBudget?.enabled
              ? `Shared AI: $${aiBudget.remaining.toFixed(2)} available`
              : 'Saved to your account'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowNew(false);
              setTab('connections');
            }}
          >
            <KeyRound size={15} /> Connections
          </Button>
          <form action="/api/auth/logout" method="post">
            <Button type="submit" variant="ghost" size="sm">Sign out</Button>
          </form>
        </div>
      </header>
      <div className="owner-layout">
        <aside className="business-nav">
          <label className="mobile-business-label" htmlFor="business-picker">Business</label>
          <select id="business-picker" className="mobile-business-picker" value={b?.id || ''} disabled={!!busy} onChange={e => select(e.target.value)}>
            {!b && <option value="">Choose a business</option>}
            {businesses.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <p className="eyebrow">BUSINESSES</p>
          {businesses.map((x) => (
            <button
              className={`business-item ${b?.id === x.id ? 'active' : ''}`}
              key={x.id}
              onClick={() => select(x.id)}
            >
              <Building2 size={16} />
              <span>
                {x.name}
                <small>
                  {x.mode === 'demo'
                    ? 'Fictional demo'
                    : new URL(x.url).hostname}
                </small>
              </span>
            </button>
          ))}
          <Button
            variant="outline"
            disabled={!!busy}
            onClick={() => {
              setShowNew(true);
      setTab('explore');
            }}
          >
            <Plus size={15} /> Add business
          </Button>
          <div className="nav-note">
            <Database size={15} />
            <span>
              Each business keeps its own evidence, rounds, and history.
            </span>
          </div>
        </aside>
        <main className="owner-main">
          {aiBudget?.enabled && tab === 'connections' && (
            <p className="small muted" style={{ marginBottom: 16 }}>
              Founder-funded AI · ${aiBudget.used.toFixed(2)} of $
              {aiBudget.limit.toFixed(2)} committed. Includes conservative
              estimates and ${aiBudget.held.toFixed(2)} held for unconfirmed
              requests. New research may pause before the balance reaches zero.
            </p>
          )}
          {notice && <output className="saved-notice" style={{display:'block'}}>{notice}</output>}
          {error && (
            <div className="error">
              {error}
              <Button variant="ghost" size="sm" onClick={() => setError('')}>
                Dismiss
              </Button>
            </div>
          )}
          {busy && (
            <div className="working">
              <RefreshCw className="spin" size={15} />
              {busy === 'organize_context' ? 'Reading your business context… This can take a moment.' : 'Working on your request…'}
            </div>
          )}
          {tab === 'connections' && !b ? (
            <Connections
              keyValue={key}
              sharedAI={aiBudget?.enabled}
              gmail={gmailToken}
              ga4={ga4Token}
              account={gmailAccount}
              setKey={setKey}
              setGmail={setGmail}
              setGa4={setGa4}
              form={form}
              setForm={setForm}
              act={act}
            />
          ) : !b || showNew ? (
            <NewBusiness
              busy={!!busy}
              form={form}
              setForm={setForm}
              cancel={b ? () => setShowNew(false) : undefined}
              create={(demo: boolean) => {
                void act(demo ? 'create_demo' : 'create_business', {
                  name: form.newName,
                  url: form.newUrl,
                });
              }}
            />
          ) : (
            <>
              <div className={`workspace-heading ${tab === 'today' ? 'compact-heading' : ''}`}>
                <div>
                  <p className="eyebrow">
                    OWNER WORKSPACE /{' '}
                    {b.mode === 'demo' ? 'FICTIONAL DEMO' : 'LIVE BUSINESS'}
                  </p>
                  <h1>{b.name}</h1>
                  <p className="muted">
                    {b.goal || 'Set a goal to focus the next round.'}
                  </p>
                </div>
                <div className="queue-count">
                  <strong>{queue.length}</strong>
                  <span>open actions</span>
                </div>
              </div>
              {b.mode === 'demo' && (
                <div className="demo-banner">
                  <FlaskConical size={16} />
                  All facts, signals, prospects, drafts, and outcomes here are
                  fictional.
                </div>
              )}
              <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
                <TabsList className={`owner-tabs ${tab === 'today' ? 'compact-tabs' : ''}`} variant="line">
                  {[
                    ['explore', 'Explore'],
                    ['do', 'Do'],
                    ['portfolio', 'Portfolio'],
                    ['today', 'Next move'],
                    ['memory', 'Business context'],
                    ['rounds', 'Growth plan'],
                    ['signals', 'Results'],
                  ].map((x) => (
                    <TabsTrigger key={x[0]} value={x[0]}>
                      {x[1]}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {tab !== 'today' && <div className="secondary-tools"><Button variant="ghost" size="sm" onClick={() => setTab('outreach')}>Prospects & messages</Button><Button variant="ghost" size="sm" onClick={() => setTab('reviews')}>Weekly review</Button></div>}
                <TabsContent value="explore">
                  <ExploreWorkspace key={b.id} b={b} act={act} busy={!!busy} aiReady={b.mode === 'demo' || !!key || !!aiBudget?.enabled} openDo={() => setTab('do')} />
                </TabsContent>
                <TabsContent value="do">
                  <DoWorkspace key={b.id} b={b} act={act} busy={!!busy} aiReady={b.mode === 'demo' || !!key || !!aiBudget?.enabled} />
                </TabsContent>
                <TabsContent value="portfolio">
                  <PortfolioWorkspace key={`${b.id}:${revision}`} b={b} businesses={businesses} act={act} busy={!!busy} selectBusiness={(id) => { void select(id); }} />
                </TabsContent>
                <TabsContent value="today">
                  <GuidedWorkspace key={`${b.id}:${revision}`} b={b} act={act} busy={!!busy} username={username} revision={revision} />
                  <details className="more-progress"><summary>Existing tools and plan history</summary><p className="small muted">Older goals and growth rounds remain preserved as historical proposals. They are not approved by this guided flow.</p><Today b={b} act={act} setTab={setTab} queue={queue}/></details>
                </TabsContent>
                <TabsContent value="memory">
                  <Memory key={`${b.id}:${revision}`} b={b} act={act} />
                </TabsContent>
                <TabsContent value="signals">
                  <Signals b={b} act={act} form={form} setForm={setForm} />
                </TabsContent>
                <TabsContent value="rounds">
                  <Rounds b={b} act={act} form={form} setForm={setForm} />
                </TabsContent>
                <TabsContent value="outreach">
                  <Outreach
                    b={b}
                    act={act}
                    form={form}
                    setForm={setForm}
                    gmailReady={!!gmailAccount}
                    aiReady={!!key || !!aiBudget?.enabled}
                  />
                </TabsContent>
                <TabsContent value="reviews">
                  <Reviews b={b} act={act} />
                </TabsContent>
                <TabsContent value="connections">
                  <Connections
                    keyValue={key}
                    sharedAI={aiBudget?.enabled}
                    gmail={gmailToken}
                    ga4={ga4Token}
                    account={gmailAccount}
                    setKey={setKey}
                    setGmail={setGmail}
                    setGa4={setGa4}
                    form={form}
                    setForm={setForm}
                    act={act}
                  />
                </TabsContent>
              </Tabs>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
function NewBusiness(p: {
  busy: boolean;
  form: FormState;
  setForm: SetForm;
  cancel?: () => void;
  create: (demo: boolean) => void;
}) {
  return (
    <section className="setup">
      <div className="setup-icon">
        <Building2 />
      </div>
      <p className="eyebrow">START WITH THE BUSINESS</p>
      <h1>Build a growth system that remembers.</h1>
      <p className="muted intro">
        Keep evidence, experiments, reviews, and outreach together through every
        round.
      </p>
      <label htmlFor="new-business-name">Business name</label>
      <Input
        id="new-business-name"
        value={p.form.newName || ''}
        onChange={(e) => p.setForm({ ...p.form, newName: e.target.value })}
        placeholder="Your business"
      />
      <label htmlFor="new-business-url">Website</label>
      <Input
        id="new-business-url"
        type="url"
        value={p.form.newUrl || ''}
        onChange={(e) => p.setForm({ ...p.form, newUrl: e.target.value })}
        placeholder="https://example.com"
      />
      <div className="action-row">
        <Button
          disabled={p.busy || !p.form.newUrl}
          onClick={() => p.create(false)}
        >
          Add business <ChevronRight size={16} />
        </Button>
        <Button
          variant="outline"
          disabled={p.busy}
          onClick={() => p.create(true)}
        >
          Open fictional demo
        </Button>
        {p.cancel && (
          <Button variant="ghost" onClick={p.cancel}>
            Cancel
          </Button>
        )}
      </div>
    </section>
  );
}
function Today({
  b,
  act,
  setTab,
  queue,
}: {
  b: BusinessDocument;
  act: Act;
  setTab: (tab: string) => void;
  queue: ReturnType<typeof ownerQueue>;
}) {
  return (
    <section className="panel">
      {queue.length > 0 && (
        <div className="owner-queue">
          <p className="eyebrow">NEEDS YOU</p>
          {queue.slice(0, 5).map((item) => (
            <button
              key={item.id}
              className="queue-item"
              onClick={() => setTab(item.tab)}
            >
              <span>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </span>
              <ChevronRight size={16} />
            </button>
          ))}
        </div>
      )}
      <div className="section-title">
        <div>
          <p className="eyebrow">NEXT BEST ACTION</p>
          <h2>
            {b.diagnosis
              ? b.diagnosis.bottleneck
              : 'Diagnose the current bottleneck'}
          </h2>
          <p className="muted">
            {b.diagnosis?.recommendation ||
              'Use sourced signals to decide what is limiting growth now.'}
          </p>
        </div>
        <Target />
      </div>
      <div className="today-grid">
        <article className="focus-card">
          <span className="card-index">01</span>
          <h3>Refresh the diagnosis</h3>
          <p>
            {b.signals.length} signal{b.signals.length === 1 ? '' : 's'}{' '}
            available. Low evidence stays visible as an unknown.
          </p>
          <Button onClick={() => act('diagnose')} disabled={!b.signals.length}>
            Diagnose now
          </Button>
        </article>
        <article className="focus-card">
          <span className="card-index">02</span>
          <h3>Run the next test</h3>
          <p>
            {b.rounds.length
              ? `${b.rounds.length} preserved round${b.rounds.length === 1 ? '' : 's'} in history.`
              : 'Turn the diagnosis into a small measurable round.'}
          </p>
          <Button variant="outline" onClick={() => setTab('rounds')}>
            Open rounds
          </Button>
        </article>
        <article className="focus-card">
          <span className="card-index">03</span>
          <h3>Review the week</h3>
          <p>
            {b.reviews[0]
              ? `Next review due ${new Date(b.reviews[0].nextReviewDue).toLocaleDateString()}.`
              : 'Generate an honest report from recorded results.'}
          </p>
          <Button variant="outline" onClick={() => setTab('reviews')}>
            Open reviews
          </Button>
        </article>
      </div>
      {b.diagnosis && (
        <div className="diagnosis">
          <div>
            <p className="eyebrow">EVIDENCE USED</p>
            {b.diagnosis.evidence.map((x) => (
              <p key={x}>• {x}</p>
            ))}
          </div>
          <div>
            <p className="eyebrow">STILL UNKNOWN</p>
            {b.diagnosis.unknowns.length ? (
              b.diagnosis.unknowns.map((x) => <p key={x}>• {x}</p>)
            ) : (
              <p>No explicit evidence gaps flagged.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
function Memory({ b, act }: { b: BusinessDocument; act: Act }) {
  const [facts, setFacts] = useState<Fact[]>(b.facts);
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">INSPECTABLE MEMORY</p>
          <h2>What the system believes</h2>
          <p className="muted">
            Every fact keeps a source, date, confidence, and owner review state.
          </p>
        </div>
        <Database />
      </div>
      <div className="profile-grid">
        <div>
          <label htmlFor="profile-goal">Goal</label>
          <Input id="profile-goal" defaultValue={b.goal} />
        </div>
        <div>
          <label htmlFor="profile-budget">Resources</label>
          <Input id="profile-budget" defaultValue={b.budget} />
        </div>
        <div>
          <label htmlFor="profile-notes">Owner notes</label>
              <Textarea id="profile-notes" rows={6} defaultValue={b.notes} />
        </div>
        <Button
          onClick={() =>
            act('update_profile', {
              name: b.name,
              goal: (
                document.querySelector('#profile-goal') as HTMLInputElement
              ).value,
              budget: (
                document.querySelector('#profile-budget') as HTMLInputElement
              ).value,
              notes: (
                document.querySelector('#profile-notes') as HTMLInputElement
              ).value,
            })
          }
        >
          Save direction
        </Button>
      </div>
      <details>
        <summary>Add an owner fact</summary>
        <div className="signal-form">
          <Input id="new-fact-label" placeholder="Label" />
          <Input id="new-fact-value" placeholder="What is true?" />
          <Input id="new-fact-source" placeholder="Source or Owner input" />
          <Button
            onClick={() =>
              act('add_fact', {
                label: (
                  document.querySelector('#new-fact-label') as HTMLInputElement
                ).value,
                value: (
                  document.querySelector('#new-fact-value') as HTMLInputElement
                ).value,
                source: (
                  document.querySelector('#new-fact-source') as HTMLInputElement
                ).value,
                confidence: 'medium',
              })
            }
          >
            Add fact
          </Button>
        </div>
      </details>
      {facts.map((f, i) => (
        <article className="memory-row" key={f.id}>
          <div className="memory-meta">
            <strong>{f.label}</strong>
            <span
              className={`pill ${f.status === 'unreviewed' ? 'amber' : 'green'}`}
            >
              {f.status}
            </span>
            <span className="pill">{f.confidence} confidence</span>
          </div>
          <Textarea
            value={f.value}
            onChange={(e) =>
              setFacts(
                facts.map((x, j) =>
                  j === i
                    ? { ...x, value: e.target.value, status: 'corrected' }
                    : x,
                ),
              )
            }
          />
          <div className="source-row">
            <Input
              value={f.source}
              onChange={(e) =>
                setFacts(
                  facts.map((x, j) =>
                    j === i ? { ...x, source: e.target.value } : x,
                  ),
                )
              }
            />
            <small>
              Observed {new Date(f.observedAt).toLocaleDateString()}
            </small>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                act('update_fact', {
                  factId: f.id,
                  value: f.value,
                  source: f.source,
                  confidence: f.confidence,
                  status:
                    f.value === b.facts[i].value ? 'confirmed' : 'corrected',
                })
              }
            >
              <Check size={14} /> Save review
            </Button>
          </div>
        </article>
      ))}
    </section>
  );
}
function Signals({
  b,
  act,
  form,
  setForm,
}: {
  b: BusinessDocument;
  act: Act;
  form: FormState;
  setForm: SetForm;
}) {
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">REAL BUSINESS SIGNALS</p>
          <h2>Evidence before advice</h2>
          <p className="muted">
            Manual entries and imports carry their provenance. No metric is
            silently treated as revenue.
          </p>
        </div>
        <BarChart3 />
      </div>
      <div className="signal-form">
        <Input
          placeholder="Metric"
          value={form.metric || ''}
          onChange={(e) => setForm({ ...form, metric: e.target.value })}
        />
        <Input
          type="number"
          placeholder="Value"
          value={form.value || ''}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
        />
        <Input
          placeholder="Period"
          value={form.period || ''}
          onChange={(e) => setForm({ ...form, period: e.target.value })}
        />
        <Input
          placeholder="Source"
          value={form.source || ''}
          onChange={(e) => setForm({ ...form, source: e.target.value })}
        />
        <Button
          onClick={() =>
            act('add_signal', {
              metric: form.metric,
              value: form.value,
              period: form.period,
              source: form.source,
              note: '',
            })
          }
        >
          Add signal
        </Button>
      </div>
      <details>
        <summary>Import CSV</summary>
        <p className="small muted">
          Columns: metric, value, period, note. Up to 200 rows.
        </p>
        <Textarea
          value={form.csv || ''}
          onChange={(e) => setForm({ ...form, csv: e.target.value })}
          placeholder={
            'metric,value,period,note\nQualified calls,3,August,CRM export'
          }
        />
        <Button
          variant="outline"
          onClick={() =>
            act('import_csv', {
              csv: form.csv,
              fileName: form.csvName || 'pasted-signals.csv',
            })
          }
        >
          Import rows
        </Button>
      </details>
      <div className="data-table">
        {b.signals
          .slice()
          .reverse()
          .map((s) => (
            <div className="data-row" key={s.id}>
              <strong>{s.value}</strong>
              <span>
                {s.metric}
                <small>{s.period}</small>
              </span>
              <span>
                {s.source}
                <small>
                  {s.confidence} confidence ·{' '}
                  {new Date(s.observedAt).toLocaleDateString()}
                </small>
              </span>
            </div>
          ))}
      </div>
    </section>
  );
}
function Rounds({
  b,
  act,
  form,
  setForm,
}: {
  b: BusinessDocument;
  act: Act;
  form: FormState;
  setForm: SetForm;
}) {
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">EXPERIMENT ROUNDS</p>
          <h2>Learn without losing history</h2>
          <p className="muted">
            Each completed result informs the next round. Past rounds stay
            intact.
          </p>
        </div>
        <FlaskConical />
      </div>
      <div className="action-row">
        <Input
          placeholder={`Round ${b.rounds.length + 1} name`}
          value={form.roundName || ''}
          onChange={(e) => setForm({ ...form, roundName: e.target.value })}
        />
        <Button onClick={() => act('create_round', { name: form.roundName })}>
          Create next round
        </Button>
      </div>
      {b.rounds
        .slice()
        .reverse()
        .map((r) => (
          <article className="round" key={r.id}>
            <div className="round-head">
              <h3>{r.name}</h3>
              <span className="pill">{r.status}</span>
              <small>{new Date(r.createdAt).toLocaleDateString()}</small>
            </div>
            {r.rationale && <p className="muted">{r.rationale}</p>}
            {r.briefSnapshot && (
              <p className="small muted">
                Planned for: {r.briefSnapshot.goal} · {r.briefSnapshot.budget}
              </p>
            )}
            {r.experiments.map((e) => (
              <div className="experiment" key={e.id}>
                <div>
                  <strong>{e.channel}</strong>
                  <p>{e.hypothesis}</p>
                  <p className="experiment-action">{e.action}</p>
                  <small>
                    Target: {e.target} {e.metric.toLowerCase()}
                  </small>
                </div>
                {e.status === 'draft' && r.status !== 'complete' && (
                  <Button
                    size="sm"
                    onClick={() =>
                      act('start_experiment', { experimentId: e.id })
                    }
                  >
                    Start
                  </Button>
                )}
                {e.status === 'draft' && r.status === 'complete' && (
                  <span className="pill">Not run</span>
                )}
                {e.status === 'running' && (
                  <div className="result-entry">
                    <Input
                      type="number"
                      placeholder="Result"
                      id={`result-${e.id}`}
                    />
                    <Input
                      placeholder="Evidence or action log"
                      id={`evidence-${e.id}`}
                    />
                    <Input
                      placeholder="What did you learn? (optional)"
                      id={`learning-${e.id}`}
                    />
                    <Button
                      size="sm"
                      onClick={() =>
                        act('record_result', {
                          experimentId: e.id,
                          result: (
                            document.querySelector(
                              `#result-${e.id}`,
                            ) as HTMLInputElement
                          ).value,
                          evidence: (
                            document.querySelector(
                              `#evidence-${e.id}`,
                            ) as HTMLInputElement
                          ).value,
                          learning: (
                            document.querySelector(
                              `#learning-${e.id}`,
                            ) as HTMLInputElement
                          ).value,
                        })
                      }
                    >
                      Record
                    </Button>
                  </div>
                )}
                {e.status === 'complete' && (
                  <p className="learning">
                    {e.result}/{e.target} · {e.learning}
                    <br />
                    <small>{e.evidence}</small>
                  </p>
                )}
              </div>
            ))}
            {r.status !== 'complete' &&
              r.experiments.some((e) => e.status === 'complete') &&
              !r.experiments.some((e) => e.status === 'running') && (
                <Button
                  variant="outline"
                  onClick={() => act('close_round', { roundId: r.id })}
                >
                  Close round and keep unstarted ideas
                </Button>
              )}
          </article>
        ))}
    </section>
  );
}
function Outreach({
  b,
  act,
  form,
  setForm,
  gmailReady,
  aiReady,
}: {
  b: BusinessDocument;
  act: Act;
  form: FormState;
  setForm: SetForm;
  gmailReady: boolean;
  aiReady: boolean;
}) {
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">FIRST EXECUTION CHANNEL</p>
          <h2>Reviewed one-to-one outreach</h2>
          <p className="muted">
            Add a real fit reason, review each draft, approve each recipient,
            then choose send. Planning never sends.
          </p>
        </div>
        <Mail />
      </div>
      <div className="prospect-form">
        {['name', 'email', 'company', 'reason', 'source'].map((k) => (
          <Input
            key={k}
            placeholder={k[0].toUpperCase() + k.slice(1)}
            value={form[k] || ''}
            onChange={(e) => setForm({ ...form, [k]: e.target.value })}
          />
        ))}
        <Button
          onClick={() =>
            act('add_prospect', {
              name: form.name,
              email: form.email,
              company: form.company,
              reason: form.reason,
              source: form.source,
            })
          }
        >
          Add prospect
        </Button>
      </div>
      <Button
        variant="outline"
        disabled={!aiReady || b.mode === 'demo'}
        onClick={() => act('discover_prospects')}
      >
        Research 3–5 sourced candidates
      </Button>
      {b.outreach.prospects.map((p) => {
        const d = b.outreach.drafts.find((d) => d.prospectId === p.id);
        return (
          <article className="prospect" key={p.id}>
            <div className="prospect-head">
              <div>
                <h3>
                  {p.name} · {p.company}
                </h3>
                <p className="small muted">
                  {p.email || 'Email needed — find and verify before approval'}{' '}
                  · {p.source}
                </p>
              </div>
              <span
                className={`pill ${p.status === 'replied' ? 'green' : p.status === 'uncertain' ? 'amber' : ''}`}
              >
                {p.status}
              </span>
            </div>
            <p>{p.reason}</p>
            {!p.email && (
              <div className="action-row">
                <Input
                  id={`prospect-email-${p.id}`}
                  type="email"
                  placeholder="Verified recipient email"
                />
                <Button
                  variant="outline"
                  onClick={() =>
                    act('update_prospect_email', {
                      prospectId: p.id,
                      email: (
                        document.querySelector(
                          `#prospect-email-${p.id}`,
                        ) as HTMLInputElement
                      ).value,
                    })
                  }
                >
                  Save email
                </Button>
              </div>
            )}
            {!d ? (
              <Button
                variant="outline"
                onClick={() => act('draft_outreach', { prospectId: p.id })}
              >
                Create draft
              </Button>
            ) : (
              <>
                <label htmlFor={`subject-${p.id}`}>Subject</label>
                <Input
                  id={`subject-${p.id}`}
                  defaultValue={d.subject}
                  readOnly={p.status !== 'drafted'}
                />
                <label htmlFor={`body-${p.id}`}>Message</label>
                <Textarea
                  id={`body-${p.id}`}
                  defaultValue={d.body}
                  readOnly={p.status !== 'drafted'}
                />
                {p.status === 'drafted' && (
                  <Button
                    onClick={() =>
                      act('approve_outreach', {
                        prospectId: p.id,
                        subject: (
                          document.querySelector(
                            `#subject-${p.id}`,
                          ) as HTMLInputElement
                        ).value,
                        body: (
                          document.querySelector(
                            `#body-${p.id}`,
                          ) as HTMLTextAreaElement
                        ).value,
                      })
                    }
                  >
                    <Check size={14} /> Approve this recipient
                  </Button>
                )}
                {p.status === 'approved' && (
                  <Button
                    disabled={!gmailReady}
                    onClick={() => act('send_approved', { prospectId: p.id })}
                  >
                    <Send size={14} /> Send approved email
                  </Button>
                )}
                {p.status === 'uncertain' && (
                  <Button
                    variant="outline"
                    onClick={() => act('reconcile_send', { prospectId: p.id })}
                  >
                    Reconcile in Gmail
                  </Button>
                )}
              </>
            )}
            {(p.replyCount || 0) > 0 && (
              <div className="reply">
                <strong>{p.replyCount} reply</strong>
                {p.snippets?.map((s: string) => (
                  <p key={s}>{s}</p>
                ))}
              </div>
            )}
          </article>
        );
      })}
      {b.outreach.prospects.some((p) => p.threadId) && (
        <Button variant="outline" onClick={() => act('sync_replies')}>
          Check replies now
        </Button>
      )}
    </section>
  );
}
function Reviews({ b, act }: { b: BusinessDocument; act: Act }) {
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">WEEKLY REVIEW</p>
          <h2>Turn results into decisions</h2>
          <p className="muted">
            Generated on demand from saved evidence. There is no background
            scheduler.
          </p>
        </div>
        <RefreshCw />
      </div>
      <Button onClick={() => act('generate_review')}>
        Generate this week’s review
      </Button>
      {b.reviews.map((r) => (
        <article className="review" key={r.id}>
          <div>
            <p className="eyebrow">
              {new Date(r.periodStart).toLocaleDateString()} —{' '}
              {new Date(r.periodEnd).toLocaleDateString()}
            </p>
            <h3>{r.summary}</h3>
          </div>
          <div>
            <strong>Wins</strong>
            {r.wins.length ? (
              r.wins.map((x: string) => <p key={x}>• {x}</p>)
            ) : (
              <p className="muted">None recorded.</p>
            )}
            <strong>Misses</strong>
            {r.misses.length ? (
              r.misses.map((x: string) => <p key={x}>• {x}</p>)
            ) : (
              <p className="muted">None recorded.</p>
            )}
            <strong>Decisions</strong>
            {r.decisions.map((x: string) => (
              <p key={x}>• {x}</p>
            ))}
          </div>
          <small>
            Next review due {new Date(r.nextReviewDue).toLocaleDateString()}
          </small>
        </article>
      ))}
    </section>
  );
}
function Connections(p: {
  sharedAI?: boolean;
  keyValue: string;
  gmail: string;
  ga4: string;
  account: string;
  setKey: (v: string) => void;
  setGmail: (v: string) => void;
  setGa4: (v: string) => void;
  form: FormState;
  setForm: SetForm;
  act: Act;
}) {
  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <p className="eyebrow">SESSION CONNECTIONS</p>
          <h2>Connected services</h2>
          <p className="muted">
            Shared AI runs on the server. Your optional personal service tokens
            stay in this tab and are never included in saved business data.
          </p>
        </div>
        <KeyRound />
      </div>
      <div className="connection-card">
        <h3>OpenAI</h3>
        <p className="small muted">
          Live web research and tailored drafts · gpt-5.4-mini
        </p>
        {p.sharedAI ? (
          <p className="connected">
            Founder-funded AI is connected. No OpenAI key needed. Requests pause
            when the shared budget cannot cover the next run.
          </p>
        ) : (
          <Input
            type="password"
            autoComplete="off"
            placeholder="OpenAI API key"
            value={p.keyValue}
            onChange={(e) => p.setKey(e.target.value)}
          />
        )}
      </div>
      <div className="connection-card">
        <h3>Gmail</h3>
        <p className="small muted">
          OAuth token with gmail.send and gmail.readonly. Sending still requires
          per-recipient approval.
        </p>
        <Input
          type="password"
          autoComplete="off"
          placeholder="Gmail OAuth bearer token"
          value={p.gmail}
          onChange={(e) => p.setGmail(e.target.value)}
        />
        <Button variant="outline" onClick={() => p.act('verify_gmail')}>
          Verify account
        </Button>
        {p.account && (
          <span className="connected">
            <Check size={14} /> {p.account}
          </span>
        )}
      </div>
      <div className="connection-card">
        <h3>Google Analytics 4</h3>
        <p className="small muted">
          OAuth token with analytics.readonly. Key events remain labeled as key
          events.
        </p>
        <Input
          type="password"
          autoComplete="off"
          placeholder="GA4 OAuth bearer token"
          value={p.ga4}
          onChange={(e) => p.setGa4(e.target.value)}
        />
        <Input
          placeholder="GA4 property ID"
          value={p.form.propertyId || ''}
          onChange={(e) => p.setForm({ ...p.form, propertyId: e.target.value })}
        />
        <div className="action-row">
          <Input
            type="date"
            value={p.form.startDate || ''}
            onChange={(e) =>
              p.setForm({ ...p.form, startDate: e.target.value })
            }
          />
          <Input
            type="date"
            value={p.form.endDate || ''}
            onChange={(e) => p.setForm({ ...p.form, endDate: e.target.value })}
          />
          <Button
            variant="outline"
            onClick={() =>
              p.act('import_ga4', {
                propertyId: p.form.propertyId,
                startDate: p.form.startDate,
                endDate: p.form.endDate,
              })
            }
          >
            Import report
          </Button>
        </div>
      </div>
    </section>
  );
}
