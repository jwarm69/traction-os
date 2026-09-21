'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Copy,
  Laptop,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
  Square,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { BusinessDocument, Endeavor } from '@/lib/engine';
import { executionCostLabel, planExecution } from '@/lib/execution-policy';
import './runner-panel.css';

type Device = {
  id: string;
  name: string;
  lastSeenAt?: string;
  createdAt?: string;
  revokedAt?: string | null;
  status?: string;
  capabilities?: { computerUse?: boolean };
};
type Approval = {
  requestId: string;
  method: string;
  details?: unknown;
  decision?: string | null;
};
type Job = {
  id: string;
  status: string;
  deviceName?: string;
  error?: string;
  result?: unknown;
  sourceJobId?: string;
  endeavorId?: string;
  approvals?: Approval[];
  executionMode?: 'codex' | 'computer';
};
type Snapshot = {
  available?: boolean;
  pairingCode?: string;
  pairingCodeExpiresAt?: string;
  devices?: Device[];
  jobs?: Job[];
  error?: string;
};

const activeStatuses = new Set([
  'queued',
  'waiting_approval',
  'running',
  'claimed',
]);
const title = (value: string) => value.replaceAll('_', ' ');
const resultText = (value: unknown) =>
  typeof value === 'string' ? value : JSON.stringify(value, null, 2) || '';

export default function RunnerPanel({
  b,
  selected,
  revision,
}: {
  b: BusinessDocument;
  selected?: Endeavor;
  revision: number;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedDevice, setSelectedDevice] = useState('');
  const [pairing, setPairing] = useState<{
    code: string;
    expiresAt?: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [executionMode, setExecutionMode] = useState<'codex' | 'computer'>(
    'codex',
  );
  const request = useRef(0);
  const inFlight = useRef(false);
  const loading = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, []);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (loading.current && !signal) return;
      loading.current = true;
      const id = ++request.current;
      try {
        const response = await fetch(
          `/api/runner?businessId=${encodeURIComponent(b.id)}`,
          { signal },
        );
        const data = (await response.json()) as Snapshot;
        if (id !== request.current) return;
        if (!response.ok) {
          if (response.status === 404) {
            setSnapshot({ available: false });
            setError('');
            return;
          }
          throw new Error(
            data.error ||
              (response.status === 401
                ? 'Please sign in again.'
                : 'Could not load runner setup.'),
          );
        }
        setSnapshot({ ...data, available: data.available ?? true });
        setError('');
        if (data.pairingCode)
          setPairing({
            code: data.pairingCode,
            expiresAt: data.pairingCodeExpiresAt,
          });
        const devices = (data.devices || []).filter(
          (device) => !device.revokedAt,
        );
        setSelectedDevice((current) =>
          devices.some((device) => device.id === current)
            ? current
            : devices[0]?.id || '',
        );
      } catch (cause) {
        if ((cause as Error).name !== 'AbortError' && id === request.current)
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not load runner setup.',
          );
      } finally {
        loading.current = false;
      }
    },
    [b.id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      request.current += 1;
      controller.abort();
    };
  }, [load]);

  const post = async (action: string, extra: Record<string, unknown> = {}) => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(action);
    setError('');
    try {
      const response = await fetch('/api/runner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: action, businessId: b.id, ...extra }),
      });
      const data = (await response.json()) as Snapshot & {
        job?: Job;
        code?: string;
        expiresAt?: string;
        ok?: boolean;
      };
      if (!mounted.current) return null;
      if (!response.ok || data.ok === false || data.available === false)
        throw new Error(data.error || 'Runner request failed.');
      if (data.code) setPairing({ code: data.code, expiresAt: data.expiresAt });
      await load();
      return data;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Runner request failed.',
      );
      return null;
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy('');
    }
  };

  useEffect(() => {
    if (!snapshot?.available) return;
    const hasActive = (snapshot.jobs || []).some(
      (job) =>
        activeStatuses.has(job.status) ||
        (job.approvals || []).some((approval) => !approval.decision),
    );
    if (!hasActive && !pairing) return;
    const timer = window.setInterval(() => void load(), 2500);
    return () => window.clearInterval(timer);
  }, [snapshot?.available, snapshot?.jobs, pairing, load]);

  useEffect(() => {
    if (!pairing?.expiresAt) return;
    const timer = window.setTimeout(
      () => setPairing(null),
      Math.max(0, Date.parse(pairing.expiresAt) - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [pairing]);

  const jobs = (snapshot?.jobs || []).filter(
    (job) => !selected || !job.endeavorId || job.endeavorId === selected.id,
  );
  const activeJob = jobs.find((job) => activeStatuses.has(job.status));
  const executionPlan = selected ? planExecution(selected) : undefined;
  const desktopRecommended =
    executionPlan?.route === 'codex' || executionPlan?.route === 'computer';
  const run = async (automatic = true) => {
    if (selected && selectedDevice)
      await post('queue_job', {
        endeavorId: selected.id,
        deviceId: selectedDevice,
        revision,
        executionMode: automatic ? 'auto' : executionMode,
      });
  };
  const approval = async (
    job: Job,
    item: Approval,
    decision: 'approved' | 'denied',
  ) => {
    await post('decide_approval', {
      jobId: job.id,
      requestId: item.requestId,
      decision,
    });
  };

  return (
    <section className="runner-panel" aria-labelledby="runner-title">
      <div className="runner-heading">
        <div>
          <span className="eyebrow">RUN ON MY COMPUTER</span>
          <h3 id="runner-title">Paired desktop runner</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Refresh runner"
          disabled={!!busy}
          onClick={() => void load()}
        >
          <RefreshCw size={15} />
        </Button>
      </div>
      <p className="runner-disclosure">
        Research uses the local Codex account. Computer use runs on your Mac
        through TypeSafe and pauses before clicks, typing, navigation, or
        submission. Screen captures stay on that Mac; extracted screen text and
        controls are sent to TypeSafe to choose each step.
      </p>
      {error && (
        <p className="runner-error" role="alert">
          {error}
        </p>
      )}
      {snapshot && snapshot.available === false && (
        <div className="runner-unavailable">
          <Laptop size={20} />
          <div>
            <strong>Desktop runner is not available yet</strong>
            <p className="small muted">
              This feature is still being set up for this account. Nothing is
              connected.
            </p>
          </div>
        </div>
      )}
      {snapshot?.available === true && (
        <>
          <div className="runner-pairing">
            <div>
              <strong>Pair a device</strong>
              <p className="small muted">
                Generate a short-lived code in Traction OS, then enter it in the
                desktop runner.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!!busy}
              onClick={() => void post('pair_code')}
            >
              <ShieldCheck size={14} /> {pairing ? 'New code' : 'Generate code'}
            </Button>
            {pairing && (
              <div className="runner-code">
                <code>{pairing.code}</code>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Copy pairing code"
                  onClick={() => navigator.clipboard.writeText(pairing.code)}
                >
                  <Copy size={14} />
                </Button>
                <small>
                  {pairing.expiresAt
                    ? `Expires ${new Date(pairing.expiresAt).toLocaleTimeString()}`
                    : 'Expires soon'}
                </small>
              </div>
            )}
          </div>
          <div className="runner-devices">
            <strong>Paired devices</strong>
            {snapshot?.devices?.filter((device) => !device.revokedAt).length ? (
              snapshot.devices
                .filter((device) => !device.revokedAt)
                .map((device) => (
                  <div className="runner-device" key={device.id}>
                    <Laptop size={16} />
                    <span>
                      <strong>{device.name}</strong>
                      <small>
                        {device.lastSeenAt
                          ? `Last seen ${new Date(device.lastSeenAt).toLocaleString()}`
                          : 'Ready to receive jobs'}
                      </small>
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!busy}
                      onClick={() =>
                        void post('revoke_device', { deviceId: device.id })
                      }
                    >
                      Revoke
                    </Button>
                  </div>
                ))
            ) : (
              <p className="small muted">No devices paired yet.</p>
            )}
          </div>
          {selected && (
            <div className="runner-send">
              <div>
                <strong>{executionPlan?.label}</strong>
                <p className="small muted">{executionPlan?.reason}</p>
                {executionPlan && (
                  <small>{executionCostLabel(executionPlan)}</small>
                )}
              </div>
              <select
                aria-label="Choose paired device"
                value={selectedDevice}
                onChange={(event) => {
                  const next = event.target.value;
                  setSelectedDevice(next);
                  if (
                    !snapshot?.devices?.find((device) => device.id === next)
                      ?.capabilities?.computerUse
                  )
                    setExecutionMode('codex');
                }}
                disabled={!snapshot?.devices?.length || !!activeJob}
              >
                <option value="">Choose a device</option>
                {(snapshot?.devices || [])
                  .filter((device) => !device.revokedAt)
                  .map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name}
                    </option>
                  ))}
              </select>
              <Button
                disabled={
                  !desktopRecommended ||
                  !selectedDevice ||
                  !!activeJob ||
                  !!busy ||
                  (executionPlan?.route === 'computer' &&
                    !snapshot?.devices?.find(
                      (device) => device.id === selectedDevice,
                    )?.capabilities?.computerUse) ||
                  ['completed', 'stopped', 'blocked'].includes(selected.status)
                }
                onClick={() => void run(true)}
              >
                <Play size={14} />{' '}
                {executionPlan?.route === 'computer'
                  ? 'Run with Jev'
                  : executionPlan?.route === 'codex'
                    ? 'Run with Codex'
                    : 'Use in-app route above'}
              </Button>
              <details className="runner-override">
                <summary>Manual route override</summary>
                <fieldset className="runner-mode" aria-label="Execution mode">
                  <Button
                    type="button"
                    size="sm"
                    variant={executionMode === 'codex' ? 'default' : 'outline'}
                    onClick={() => setExecutionMode('codex')}
                  >
                    Codex
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      executionMode === 'computer' ? 'default' : 'outline'
                    }
                    disabled={
                      !snapshot?.devices?.find(
                        (device) => device.id === selectedDevice,
                      )?.capabilities?.computerUse
                    }
                    onClick={() => setExecutionMode('computer')}
                  >
                    Jev
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!selectedDevice || !!activeJob || !!busy}
                    onClick={() => void run(false)}
                  >
                    Run override
                  </Button>
                </fieldset>
              </details>
            </div>
          )}
          {activeJob && (
            <div
              className={`runner-job ${activeJob.status}`}
              aria-live="polite"
            >
              <div className="runner-job-top">
                <span>
                  <Loader2 size={14} className="runner-spin" />{' '}
                  {activeJob.status === 'claimed'
                    ? 'Running'
                    : title(activeJob.status)}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    void post('cancel_job', { jobId: activeJob.id })
                  }
                >
                  <Square size={13} /> Cancel
                </Button>
              </div>
              {(activeJob.approvals || [])
                .filter((item) => !item.decision)
                .map((item) => (
                  <div className="runner-approval" key={item.requestId}>
                    <strong>
                      {item.method === 'computer/action/requestApproval'
                        ? 'Allow this computer action?'
                        : `Approval needed: ${item.method}`}
                    </strong>
                    <pre>{JSON.stringify(item.details ?? null, null, 2)}</pre>
                    <div>
                      <Button
                        size="sm"
                        onClick={() =>
                          void approval(activeJob, item, 'approved')
                        }
                      >
                        Approve once
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void approval(activeJob, item, 'denied')}
                      >
                        <X size={14} /> Decline
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
          {jobs
            .filter((job) => !activeStatuses.has(job.status))
            .slice(0, 3)
            .map((job) => (
              <div
                className={`runner-job runner-history ${job.status}`}
                key={job.id}
              >
                <span>
                  {job.status === 'completed' ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <X size={14} />
                  )}{' '}
                  {title(job.status)}
                </span>
                {job.sourceJobId && (
                  <small>Source job: {job.sourceJobId}</small>
                )}
                <small>Source job: {job.id}</small>
                {!!job.result && (
                  <div className="runner-result">
                    <strong>
                      Returned result{' '}
                      <small>(unverified — review before using)</small>
                    </strong>
                    <pre>{resultText(job.result)}</pre>
                    <div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          navigator.clipboard.writeText(resultText(job.result))
                        }
                      >
                        <Copy size={14} /> Copy
                      </Button>
                    </div>
                  </div>
                )}
                {job.error && <p className="runner-error">{job.error}</p>}
              </div>
            ))}
        </>
      )}
    </section>
  );
}
