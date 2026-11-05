import type { DocumentMetadata } from "./documents.ts";

export const jurivanaRequestTypes = [
  "LEGAL",
  "COMPLIANCE",
  "PROPERTY_VERIFICATION",
  "BUSINESS_REGISTRATION",
] as const;

export type JurivanaRequestType = (typeof jurivanaRequestTypes)[number];
export type JurivanaRequestStatus =
  | "SUBMITTED"
  | "IN_REVIEW"
  | "NEEDS_INFORMATION"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type JurivanaRequest = {
  id: string;
  tenantId: string;
  customerId: string;
  type: JurivanaRequestType;
  status: JurivanaRequestStatus;
  title: string;
  description: string;
  assignedToUserId?: string;
  documentIds: readonly string[];
  createdAt: string;
  updatedAt: string;
};

export type JurivanaRequestComment = {
  id: string;
  requestId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
};

export type CreateJurivanaRequest = Pick<
  JurivanaRequest,
  "customerId" | "type" | "title" | "description"
> & {
  documentIds?: readonly string[];
};

export interface JurivanaRequestService {
  create(
    request: CreateJurivanaRequest,
    tenantId: string,
    actorUserId: string,
  ): Promise<JurivanaRequest>;
  list(
    tenantId: string,
    filters?: {
      type?: JurivanaRequestType;
      status?: JurivanaRequestStatus;
      assignedToUserId?: string;
    },
  ): Promise<readonly JurivanaRequest[]>;
  assign(
    requestId: string,
    tenantId: string,
    assigneeUserId: string,
    actorUserId: string,
  ): Promise<JurivanaRequest>;
  updateStatus(
    requestId: string,
    tenantId: string,
    status: JurivanaRequestStatus,
    actorUserId: string,
  ): Promise<JurivanaRequest>;
  addComment(
    requestId: string,
    tenantId: string,
    authorUserId: string,
    body: string,
  ): Promise<JurivanaRequestComment>;
  listDocuments(
    requestId: string,
    tenantId: string,
  ): Promise<readonly DocumentMetadata[]>;
}
