export type RunnerDevice = {
  id: string;
  name: string;
  createdAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
};
export type RunnerJobStatus =
  | 'queued'
  | 'claimed'
  | 'completed'
  | 'failed'
  | 'canceled';
export type RunnerJob = {
  id: string;
  businessId: string;
  endeavorId: string;
  deviceId: string;
  revision: number;
  status: RunnerJobStatus;
  brief?: string;
  result?: unknown;
  error?: string;
  createdAt: string;
  claimedAt?: string;
  completedAt?: string;
  leaseExpiresAt?: string;
  approvals?: RunnerDecision[];
};
export type ApprovalEvent = {
  requestId: string;
  method: string;
  details: unknown;
  decision: 'approved' | 'denied' | null;
};
export type RunnerDecision = {
  requestId: string;
  method: string;
  details: unknown;
  decision: 'approved' | 'denied' | null;
};
export type RunnerClaim = { job: RunnerJob; leaseToken: string; brief: string };
