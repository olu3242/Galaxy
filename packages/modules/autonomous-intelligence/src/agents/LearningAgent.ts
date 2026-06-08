import type { Pool } from 'pg';

export class LearningAgent {
  constructor(private readonly pool: Pool) {}

  run(_organizationId: string): { insights: number } {
    // Stub: analyze recent workflow patterns and generate learning insights
    void this.pool;
    return { insights: 0 };
  }
}
