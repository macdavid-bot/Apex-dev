import fs from 'fs/promises';
import path from 'path';
import { getStoragePath } from './index.js';
import type { Proposal } from '../types/index.js';

export class ProposalStorage {
  private basePath: string;

  constructor() {
    this.basePath = path.join(getStoragePath(), 'proposals');
  }

  private async ensureBase() {
    await fs.mkdir(this.basePath, { recursive: true });
  }

  private fileForId(id: string) {
    return path.join(this.basePath, `${id}.json`);
  }

  async saveProposal(proposal: Proposal): Promise<void> {
    await this.ensureBase();
    const file = this.fileForId(proposal.id);
    await fs.writeFile(file, JSON.stringify(proposal, null, 2), { mode: 0o600 });
  }

  async getProposal(id: string): Promise<Proposal | null> {
    try {
      const file = this.fileForId(id);
      const raw = await fs.readFile(file, 'utf-8');
      return JSON.parse(raw) as Proposal;
    } catch (error) {
      return null;
    }
  }

  async listProposals(): Promise<Proposal[]> {
    await this.ensureBase();
    const files = await fs.readdir(this.basePath);
    const proposals: Proposal[] = [];
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const raw = await fs.readFile(path.join(this.basePath, f), 'utf-8');
      proposals.push(JSON.parse(raw));
    }
    return proposals;
  }

  async appendLog(id: string, entry: { timestamp: string; level?: string; message: string }): Promise<void> {
    const proposal = await this.getProposal(id);
    if (!proposal) throw new Error(`Proposal ${id} not found`);
    proposal.logs = proposal.logs || [];
    proposal.logs.push(entry);
    proposal.updatedAt = new Date().toISOString();
    await this.saveProposal(proposal);
  }
}
