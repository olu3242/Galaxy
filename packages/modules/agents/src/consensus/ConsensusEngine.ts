import { randomUUID } from 'node:crypto';

export type VoteValue = 'approve' | 'reject' | 'abstain';

export interface ConsensusVote {
  agentId: string;
  value: VoteValue;
  confidence: number; // 0-1
  rationale: string;
  castAt: string;
}

export interface ConsensusProposal {
  id: string;
  organizationId: string;
  correlationId: string;
  topic: string;
  payload: Record<string, unknown>;
  requiredParticipants: string[];
  threshold: number; // fraction required to pass (e.g. 0.6 = 60%)
  votes: ConsensusVote[];
  status: 'open' | 'passed' | 'rejected' | 'expired';
  createdAt: string;
  resolvedAt?: string;
}

export interface ConsensusResult {
  proposalId: string;
  outcome: 'passed' | 'rejected' | 'inconclusive';
  approveCount: number;
  rejectCount: number;
  abstainCount: number;
  weightedConfidence: number;
}

/**
 * ConsensusEngine — multi-agent voting / consensus resolution.
 *
 * Agents cast votes on a proposal; the engine resolves when a threshold
 * is reached or when all required participants have voted.
 */
export class ConsensusEngine {
  private readonly proposals = new Map<string, ConsensusProposal>();

  /** Create a new consensus proposal and return its id. */
  createProposal(
    organizationId: string,
    topic: string,
    payload: Record<string, unknown>,
    requiredParticipants: string[],
    threshold = 0.6,
    correlationId?: string,
  ): ConsensusProposal {
    const proposal: ConsensusProposal = {
      id: randomUUID(),
      organizationId,
      correlationId: correlationId ?? randomUUID(),
      topic,
      payload,
      requiredParticipants,
      threshold,
      votes: [],
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    this.proposals.set(proposal.id, proposal);
    return proposal;
  }

  /** Cast a vote on an open proposal. Returns resolved result if quorum reached. */
  castVote(
    proposalId: string,
    agentId: string,
    value: VoteValue,
    confidence: number,
    rationale: string,
  ): ConsensusResult | null {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);
    if (proposal.status !== 'open') {
      throw new Error(`Proposal ${proposalId} is already ${proposal.status}`);
    }
    if (!proposal.requiredParticipants.includes(agentId)) {
      throw new Error(`Agent ${agentId} is not a required participant for proposal ${proposalId}`);
    }
    if (proposal.votes.some((v) => v.agentId === agentId)) {
      throw new Error(`Agent ${agentId} has already voted on proposal ${proposalId}`);
    }

    proposal.votes.push({
      agentId,
      value,
      confidence: Math.max(0, Math.min(1, confidence)),
      rationale,
      castAt: new Date().toISOString(),
    });

    // Check if quorum reached
    const allVoted = proposal.requiredParticipants.every((id) =>
      proposal.votes.some((v) => v.agentId === id),
    );

    if (allVoted) {
      return this.resolve(proposalId);
    }

    // Check early majority
    const approveCount = proposal.votes.filter((v) => v.value === 'approve').length;
    const needed = Math.ceil(proposal.requiredParticipants.length * proposal.threshold);
    if (approveCount >= needed) {
      return this.resolve(proposalId);
    }

    const rejectCount = proposal.votes.filter((v) => v.value === 'reject').length;
    const canStillPass =
      proposal.requiredParticipants.length - proposal.votes.length + approveCount >= needed;
    if (!canStillPass || rejectCount >= needed) {
      return this.resolve(proposalId);
    }

    return null;
  }

  /** Force resolution of a proposal (e.g. on timeout). */
  resolve(proposalId: string): ConsensusResult {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error(`Proposal ${proposalId} not found`);

    const approveCount = proposal.votes.filter((v) => v.value === 'approve').length;
    const rejectCount = proposal.votes.filter((v) => v.value === 'reject').length;
    const abstainCount = proposal.votes.filter((v) => v.value === 'abstain').length;

    const needed = Math.ceil(proposal.requiredParticipants.length * proposal.threshold);
    const outcome: ConsensusResult['outcome'] =
      approveCount >= needed ? 'passed' : rejectCount >= needed ? 'rejected' : 'inconclusive';

    proposal.status = outcome === 'passed' ? 'passed' : 'rejected';
    proposal.resolvedAt = new Date().toISOString();

    const approveVotes = proposal.votes.filter((v) => v.value === 'approve');
    const weightedConfidence =
      approveVotes.length > 0
        ? approveVotes.reduce((sum, v) => sum + v.confidence, 0) / approveVotes.length
        : 0;

    return {
      proposalId,
      outcome,
      approveCount,
      rejectCount,
      abstainCount,
      weightedConfidence,
    };
  }

  getProposal(proposalId: string): ConsensusProposal | undefined {
    return this.proposals.get(proposalId);
  }
}
