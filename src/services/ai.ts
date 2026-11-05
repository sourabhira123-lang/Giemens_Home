export const agentIds = [
  "AI_RECEPTIONIST",
  "LEAD_QUALIFICATION",
  "PROPOSAL_GENERATOR",
  "LEGAL_ASSISTANT",
  "PROPERTY_ASSISTANT",
  "COMPLIANCE_ASSISTANT",
  "DOCUMENT_SCANNER",
  "CEO_COPILOT",
  "SALES",
  "WHATSAPP",
  "LEGAL_DRAFTING",
  "CONTRACT_REVIEW",
  "DOCUMENT_VERIFICATION",
  "INVOICE",
  "GST",
  "HR",
  "RECRUITMENT",
  "PROJECT_MONITORING",
  "CLIENT_SUCCESS",
] as const;

export type AgentId = (typeof agentIds)[number];
export type AgentExecutionStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export type AgentExecutionContext = {
  tenantId: string;
  actorUserId: string;
  correlationId: string;
  signal?: AbortSignal;
};

export type AgentExecution = {
  id: string;
  agentId: AgentId;
  status: AgentExecutionStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  errorCode?: string;
};

export interface IAgent<Input = unknown, Output = unknown> {
  readonly id: AgentId;
  execute(input: Input, context: AgentExecutionContext): Promise<Output>;
}

export interface AgentRegistry {
  get(agentId: AgentId): IAgent | undefined;
  list(): readonly AgentId[];
}

export interface AIService {
  execute(
    agentId: AgentId,
    input: unknown,
    context: AgentExecutionContext,
  ): Promise<AgentExecution>;
  getExecution(executionId: string, tenantId: string): Promise<AgentExecution | undefined>;
}
