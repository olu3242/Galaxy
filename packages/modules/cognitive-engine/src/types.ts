// Re-export all engine types for convenient single-import access
export type { AgentContext, ContextEnrichmentInput } from './engines/GxContextEngine.js';
export type {
  MemoryScope,
  MemoryEntry,
  MemoryWriteInput,
  MemoryReadInput,
} from './engines/GxMemoryEngine.js';
export type {
  IntentCategory,
  ExtractedEntity,
  DetectedGoal,
  IntentAnalysis,
} from './engines/GxIntentEngine.js';
export type {
  ReasoningStrategy,
  ReasoningStep,
  ReasoningTrace,
  EvidenceItem,
  ReasoningInput,
} from './engines/GxReasoningEngine.js';
export type { TaskStatus, PlanTask, ExecutionPlan, PlanInput } from './engines/GxPlanningEngine.js';
export type {
  ExecutionResult,
  ToolHandler,
  ToolExecutionContext,
  ExecutionEngineOptions,
} from './engines/GxExecutionEngine.js';
export type {
  VerificationStatus,
  VerificationCheck,
  VerificationResult,
  VerificationInput,
} from './engines/GxVerificationEngine.js';
export type { LearningEvent, LearningInsight } from './engines/GxLearningEngine.js';
export type { BottleneckReport } from './engines/GxOptimizationEngine.js';
export type { GovernanceDecision, GovernanceCheckInput } from './engines/GxGovernanceEngine.js';
export type {
  CommunicationChannel,
  OutboundMessage,
  MessageDeliveryResult,
  ChannelAdapter,
} from './engines/GxCommunicationEngine.js';
