export type MemoryType = 'decision' | 'pattern' | 'lesson' | 'preference' | 'constraint';

export interface OrgMemory {
  id: string;
  organizationId: string;
  memoryType: MemoryType;
  subject: string;
  content: string;
  source: string;
  confidence: number;
  relevanceTags: string[];
  isValid: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoreMemoryInput {
  memoryType: MemoryType;
  subject: string;
  content: string;
  source: string;
  confidence?: number;
  relevanceTags?: string[];
}

export interface RecallQuery {
  type?: MemoryType;
  tags?: string[];
  limit?: number;
  onlyValid?: boolean;
}

export interface MemoryStats {
  total: number;
  byType: Record<MemoryType, number>;
  averageConfidence: number;
  invalidCount: number;
}
