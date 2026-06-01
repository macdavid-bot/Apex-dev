export type ProposalStatus =
  | 'pending'
  | 'approved'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ProposalType = 'repo-edit' | 'vps-deploy';

export interface FilePatch {
  path: string;
  patch: string; // unified diff
}

export interface RollbackPlan {
  description: string;
  reversePatches?: FilePatch[];
  manualSteps?: string[];
}

export interface LogEntry {
  timestamp: string;
  level?: 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export interface Proposal {
  id: string;
  type: ProposalType;
  title: string;
  description?: string;
  repository?: string; // optional repo target
  servers?: string[]; // server ids for VPS deploy
  requestedBy?: string;
  items?: FilePatch[]; // proposed file patches
  commands?: string[]; // proposed commands for VPS
  rollbackPlan?: RollbackPlan;
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  logs?: LogEntry[];
}
