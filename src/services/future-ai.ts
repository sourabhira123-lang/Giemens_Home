import type { FutureIntegration } from "../types/ecosystem";

export const futureAiServices: FutureIntegration[] = [
  {
    name: "CRM",
    purpose: "Centralizes client records and relationship visibility.",
    endpoint: "/api/crm/clients",
    status: "planned",
  },
  {
    name: "ERP",
    purpose: "Links operational records to service delivery and billing workflows.",
    endpoint: "/api/erp/operations",
    status: "in_review",
  },
  {
    name: "AI Receptionist",
    purpose: "Handles intake screening and scheduling support.",
    endpoint: "/api/ai/receptionist",
    status: "planned",
  },
  {
    name: "Proposal Generator",
    purpose: "Creates consistent engagement proposals with service context.",
    endpoint: "/api/proposals/generate",
    status: "planned",
  },
];

export async function getFutureAiServices() {
  return futureAiServices;
}
