import { describe, it, expect } from 'vitest';
import {
  ALL_MANIFESTS,
  ALICE_MANIFEST,
  MAX_MANIFEST,
  FINN_MANIFEST,
  EVA_MANIFEST,
  ATLAS_MANIFEST,
  SAGE_MANIFEST,
  NOVA_MANIFEST,
  LYRA_MANIFEST,
  AURORA_MANIFEST,
  TITAN_MANIFEST,
  ORION_MANIFEST,
  MERCURY_MANIFEST,
  PHOENIX_MANIFEST,
  APOLLO_MANIFEST,
  GUARDIAN_MANIFEST,
} from '../manifests/index.js';

describe('Agent Manifests', () => {
  it('ALL_MANIFESTS contains exactly 15 manifests', () => {
    expect(ALL_MANIFESTS).toHaveLength(15);
  });

  it('every manifest has required fields', () => {
    for (const manifest of ALL_MANIFESTS) {
      expect(manifest.id).toBeTruthy();
      expect(manifest.name).toBeTruthy();
      expect(manifest.fullName).toBeTruthy();
      expect(manifest.agentType).toBeTruthy();
      expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(manifest.capabilities.length).toBeGreaterThan(0);
      expect(manifest.automationDomains.length).toBeGreaterThan(0);
      expect(['chain_of_thought', 'tree_of_thought', 'evidence_gathering']).toContain(
        manifest.defaultStrategy,
      );
      expect(manifest.maxConcurrentTasks).toBeGreaterThan(0);
      expect(manifest.requiresHumanApprovalFor.length).toBeGreaterThan(0);
      expect([1, 2, 3, 4, 5]).toContain(manifest.impactTier);
      expect(manifest.description).toBeTruthy();
    }
  });

  it('all agent types in ALL_MANIFESTS are unique', () => {
    const types = ALL_MANIFESTS.map((m) => m.agentType);
    const unique = new Set(types);
    expect(unique.size).toBe(types.length);
  });

  it('all manifest ids are unique', () => {
    const ids = ALL_MANIFESTS.map((m) => m.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('ALICE manifest has correct properties', () => {
    expect(ALICE_MANIFEST.id).toBe('AG-001');
    expect(ALICE_MANIFEST.agentType).toBe('alice');
    expect(ALICE_MANIFEST.impactTier).toBe(4);
    expect(ALICE_MANIFEST.defaultStrategy).toBe('tree_of_thought');
  });

  it('GUARDIAN manifest has highest impact tier', () => {
    expect(GUARDIAN_MANIFEST.impactTier).toBe(5);
    expect(GUARDIAN_MANIFEST.agentType).toBe('guardian');
  });

  it('TITAN manifest has impact tier 5', () => {
    expect(TITAN_MANIFEST.impactTier).toBe(5);
  });

  it('PHOENIX manifest has impact tier 5', () => {
    expect(PHOENIX_MANIFEST.impactTier).toBe(5);
  });

  it('ATLAS manifest has lowest impact tier (2)', () => {
    expect(ATLAS_MANIFEST.impactTier).toBe(2);
  });

  it('each named manifest is also in ALL_MANIFESTS', () => {
    const named = [
      ALICE_MANIFEST,
      MAX_MANIFEST,
      FINN_MANIFEST,
      EVA_MANIFEST,
      ATLAS_MANIFEST,
      SAGE_MANIFEST,
      NOVA_MANIFEST,
      LYRA_MANIFEST,
      AURORA_MANIFEST,
      TITAN_MANIFEST,
      ORION_MANIFEST,
      MERCURY_MANIFEST,
      PHOENIX_MANIFEST,
      APOLLO_MANIFEST,
      GUARDIAN_MANIFEST,
    ];
    for (const manifest of named) {
      expect(ALL_MANIFESTS).toContain(manifest);
    }
  });

  it('governance-related manifests require human approval for sensitive actions', () => {
    const sensitiveManifests = [ALICE_MANIFEST, SAGE_MANIFEST, TITAN_MANIFEST, GUARDIAN_MANIFEST];
    for (const m of sensitiveManifests) {
      expect(m.requiresHumanApprovalFor.length).toBeGreaterThan(0);
    }
  });
});
