import { describe, it, expect, vi } from 'vitest';
import type { Pool } from 'pg';
import { LearningAgent } from '../agents/LearningAgent.js';
import { EvolutionAgent } from '../agents/EvolutionAgent.js';
import { GuardianAgent } from '../agents/GuardianAgent.js';
import { HealingAgent } from '../agents/HealingAgent.js';
import { IntelligenceAgent } from '../agents/IntelligenceAgent.js';

const ORG_ID = '00000000-0000-0000-0000-000000000001';

function makePool(): Pool {
  return { query: vi.fn() } as unknown as Pool;
}

describe('LearningAgent', () => {
  it('run returns insights count of 0 (stub)', () => {
    const agent = new LearningAgent(makePool());
    expect(agent.run(ORG_ID)).toEqual({ insights: 0 });
  });
});

describe('EvolutionAgent', () => {
  it('run returns improvements count of 0 (stub)', () => {
    const agent = new EvolutionAgent(makePool());
    expect(agent.run(ORG_ID)).toEqual({ improvements: 0 });
  });
});

describe('GuardianAgent', () => {
  it('run returns alerts count of 0 (stub)', () => {
    const agent = new GuardianAgent(makePool());
    expect(agent.run(ORG_ID)).toEqual({ alerts: 0 });
  });
});

describe('HealingAgent', () => {
  it('run returns healed count of 0 (stub)', () => {
    const agent = new HealingAgent(makePool());
    expect(agent.run(ORG_ID)).toEqual({ healed: 0 });
  });
});

describe('IntelligenceAgent', () => {
  it('run returns reports count of 0 (stub)', () => {
    const agent = new IntelligenceAgent(makePool());
    expect(agent.run(ORG_ID)).toEqual({ reports: 0 });
  });
});
