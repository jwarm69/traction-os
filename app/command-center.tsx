'use client';

import {
  Activity,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  FileText,
  Plus,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BusinessDocument, Endeavor } from '@/lib/engine';
import {
  executionCostLabel,
  planExecution,
  type ExecutionPlan,
} from '@/lib/execution-policy';
import type { OwnerAction } from '@/lib/owner-queue';

type Summary = {
  id: string;
  name: string;
  mode: string;
  portfolio?: BusinessDocument['portfolio'];
  workSummary?: {
    total: number;
    active: number;
    blocked: number;
    latestObservation?: string;
  };
};

type AiBudget = {
  enabled: boolean;
  limit: number;
  used: number;
  remaining: number;
  held: number;
};

type Act = (op: string, extra?: Record<string, unknown>) => Promise<boolean>;

const priorityLabels = {
  now: 'Now',
  next: 'Next',
  maintain: 'Maintain',
  paused: 'Paused',
};

const activeWork = (business: BusinessDocument) => {
  const priorities: Endeavor['status'][] = [
    'in_progress',
    'ready',
    'preparing',
  ];
  const work = business.work?.endeavors || [];
  return priorities
    .flatMap((status) => work.filter((item) => item.status === status))
    .at(0);
};

const latestLearning = (business: BusinessDocument) =>
  (business.work?.endeavors || [])
    .flatMap((item) => item.observations)
    .sort(
      (a, b) =>
        new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime(),
    )
    .at(0);

const actionCopy = (plan: ExecutionPlan) => {
  if (plan.route === 'in_app')
    return plan.workload === 'research' ? 'Run research safely' : 'Create draft safely';
  if (plan.route === 'codex') return 'Open implementation brief';
  if (plan.route === 'computer') return 'Open reviewed action';
  return 'Review owner decision';
};

const costCopy = (plan: ExecutionPlan) => {
  if (!plan.maximumSharedReservationMicros)
    return executionCostLabel(plan);
  const precision =
    plan.maximumSharedReservationMicros < 100_000 ? 3 : 2;
  return `Up to $${(
    plan.maximumSharedReservationMicros / 1_000_000
  ).toFixed(precision)} shared AI`;
};

export default function CommandCenter({
  business,
  businesses,
  queue,
  aiBudget,
  aiReady,
  busy,
  act,
  openTab,
  selectBusiness,
  addBusiness,
}: {
  business: BusinessDocument;
  businesses: Summary[];
  queue: OwnerAction[];
  aiBudget?: AiBudget;
  aiReady: boolean;
  busy: boolean;
  act: Act;
  openTab: (tab: string) => void;
  selectBusiness: (id: string) => void;
  addBusiness: () => void;
}) {
  const work = activeWork(business);
  const plan = work ? planExecution(work) : undefined;
  const attention = queue.slice(0, 3);
  const learning = latestLearning(business);
  const latestRun = work?.executionRuns?.[0];
  const running = latestRun?.status === 'running';

  const runRecommended = () => {
    if (work && plan?.route === 'in_app') {
      void act('run_work', { endeavorId: work.id });
      return;
    }
    if (work) {
      openTab('do');
      return;
    }
    if (queue[0]) {
      openTab(queue[0].tab);
      return;
    }
    openTab('explore');
  };

  const recommendedTitle =
    work?.title || queue[0]?.title || `Explore what ${business.name} should try next`;
  const recommendedDescription =
    work?.description ||
    queue[0]?.detail ||
    'Use the saved business context to develop a few grounded routes and choose one.';

  return (
    <section className="command-center" aria-labelledby="command-center-title">
      <div className="command-heading">
        <p className="eyebrow">
          OWNER WORKSPACE / {business.mode === 'demo' ? 'FICTIONAL DEMO' : 'LIVE BUSINESS'}
        </p>
        <h1 id="command-center-title">Your command center</h1>
        <p>Keep attention on the next useful move.</p>
      </div>

      <div className="command-grid">
        <div className="command-column command-column-main">
          <article className="command-card command-recommendation">
            <p className="eyebrow">{business.name} · RECOMMENDED NEXT</p>
            <h2>{recommendedTitle}</h2>
            <p className="command-lede">{recommendedDescription}</p>

            {plan && (
              <div className="command-safety" aria-label="Execution limits">
                <span>
                  <WalletCards size={18} /> {costCopy(plan)}
                </span>
                <span>
                  <ShieldCheck size={18} />
                  {plan.requiresApproval
                    ? 'Approval before consequential action'
                    : 'Draft or research only · no external action'}
                </span>
              </div>
            )}

            <div className="command-primary-actions">
              <Button
                size="lg"
                className="command-primary"
                onClick={runRecommended}
                disabled={
                  busy ||
                  running ||
                  Boolean(work && plan?.route === 'in_app' && !aiReady)
                }
              >
                <Activity size={18} />
                {running
                  ? 'Working safely…'
                  : plan
                    ? actionCopy(plan)
                    : queue[0]
                      ? 'Review next step'
                      : 'Explore next move'}
              </Button>
              {work && (
                <Button variant="ghost" onClick={() => openTab('do')}>
                  Adjust brief
                </Button>
              )}
            </div>

            <details className="command-details">
              <summary><ChevronDown size={18} /> How this runs</summary>
              {plan ? (
                <div>
                  <strong>{plan.label}</strong>
                  <p>{plan.reason}</p>
                </div>
              ) : (
                <p>
                  Nothing is run yet. You’ll review a route, its maximum cost,
                  and any required approval before work starts.
                </p>
              )}
            </details>
          </article>

          <article className="command-card command-businesses">
            <p className="eyebrow">YOUR BUSINESSES</p>
            <div className="command-list">
              {businesses.map((item) => {
                const current = item.id === business.id;
                return (
                  <div className="command-business-row" key={item.id}>
                    <span className="command-square-icon"><Building2 size={18} /></span>
                    <strong>{item.name}</strong>
                    {item.portfolio?.priority && (
                      <span className={`command-priority priority-${item.portfolio.priority}`}>
                        {priorityLabels[item.portfolio.priority]}
                      </span>
                    )}
                    <span className="command-business-count">
                      {current
                        ? `${queue.length} open action${queue.length === 1 ? '' : 's'}`
                        : `${item.workSummary?.active || 0} active work item${item.workSummary?.active === 1 ? '' : 's'}`}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() => (current ? openTab('explore') : selectBusiness(item.id))}
                      disabled={busy}
                    >
                      {current ? 'Open business' : 'Switch business'} <ChevronRight size={16} />
                    </Button>
                  </div>
                );
              })}
              <button className="command-add-business" type="button" onClick={addBusiness}>
                <span className="command-square-icon"><Plus size={20} /></span>
                Add business
                <ChevronRight size={18} />
              </button>
            </div>
          </article>

          <article className="command-card command-activity">
            <p className="eyebrow">RECENT ACTIVITY · {business.name}</p>
            {business.log.length ? (
              business.log.slice(0, 4).map((entry, index) => (
                <div className="command-activity-row" key={`${entry.at}:${index}`}>
                  {index === 0 ? (
                    <CheckCircle2 size={22} className="activity-complete" />
                  ) : (
                    <Circle size={22} className="activity-pending" />
                  )}
                  <span>
                    <strong>{entry.text}</strong>
                    <small>{new Date(entry.at).toLocaleString()}</small>
                  </span>
                </div>
              ))
            ) : (
              <p className="command-empty">No activity has been recorded yet.</p>
            )}
          </article>
        </div>

        <aside className="command-column command-column-rail">
          <article className="command-card command-attention">
            <p className="eyebrow">NEEDS YOUR ATTENTION</p>
            {attention.length ? (
              attention.map((item) => (
                <button key={item.id} type="button" onClick={() => openTab(item.tab)}>
                  <span className="command-square-icon"><FileText size={18} /></span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{business.name}</small>
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))
            ) : (
              <p className="command-empty">Nothing is waiting on you right now.</p>
            )}
          </article>

          <article className="command-card command-spending">
            <p className="eyebrow">SPENDING</p>
            <p>Maximums are shown before each action.</p>
            <button type="button" onClick={() => openTab('connections')}>
              <ChevronRight size={18} />
              {aiBudget?.enabled
                ? `View budget details · $${aiBudget.remaining.toFixed(2)} available`
                : 'View budget details'}
            </button>
          </article>

          <article className="command-card command-learning">
            <p className="eyebrow">LATEST LEARNING</p>
            {learning ? (
              <>
                <div className="command-learning-title">
                  <span className="command-square-icon"><FileText size={18} /></span>
                  <span>
                    <strong>{learning.summary}</strong>
                    <small>{business.name}</small>
                  </span>
                </div>
                {learning.nextDecision && <p>{learning.nextDecision}</p>}
                <Button variant="ghost" onClick={() => openTab('do')}>
                  <ChevronRight size={18} /> View work and learnings
                </Button>
              </>
            ) : (
              <>
                <p>No work observation has been recorded for this business yet.</p>
                <Button variant="ghost" onClick={() => openTab('do')}>
                  <ChevronRight size={18} /> Open work
                </Button>
              </>
            )}
          </article>
        </aside>
      </div>
    </section>
  );
}
