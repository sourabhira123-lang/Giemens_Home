import type { EcosystemCapability, FutureIntegration } from "../types/ecosystem";

export const jurivanaServices: EcosystemCapability[] = [
  {
    title: "Legal Services",
    description: "Expert review, documentation support and process guidance for legal and commercial matters.",
  },
  {
    title: "Property Verification",
    description: "Verification, due diligence and documentation support across property transactions and records.",
  },
  {
    title: "Regulatory Compliance",
    description: "Business compliance tracking, filing support and regulatory process guidance.",
  },
  {
    title: "Documentation Support",
    description: "Structured support for forms, contracts, records and essential business documentation.",
  },
  {
    title: "Business Registration",
    description: "Guidance for entity setup, filing readiness and registration-related administrative support.",
  },
];

export const jurivanaAiFeatures: EcosystemCapability[] = [
  { title: "AI Legal Assistant", description: "Drafting support, guided workflows and business process assistance." },
  { title: "Compliance Tracker", description: "Monitoring milestones, renewals and filing-dependent obligations." },
  { title: "Document Intelligence", description: "Smart extraction, indexing and classification for legal and compliance documents." },
  { title: "Contract Review", description: "Reducing review effort with searchable summaries and standard checks." },
  { title: "Property Due Diligence", description: "Checking records, completeness and verification steps in a structured workflow." },
];

export const jurivanaBenefits = [
  "Faster Turnaround",
  "Expert Support",
  "Secure Documentation",
  "Centralized Client Portal",
];

export const futureEcosystemIntegrations: FutureIntegration[] = [
  {
    name: "CRM",
    purpose: "Lead intake, client profile management and pipeline visibility.",
    endpoint: "/api/crm/lead-sync",
    status: "planned",
  },
  {
    name: "ERP",
    purpose: "Operational data alignment for compliance, billing and project coordination.",
    endpoint: "/api/erp/sync",
    status: "in_review",
  },
  {
    name: "AI Receptionist",
    purpose: "Initial enquiry triage and appointment guidance for new client conversations.",
    endpoint: "/api/ai/receptionist",
    status: "planned",
  },
  {
    name: "Lead Qualification Agent",
    purpose: "Qualification workflows designed to route inbound opportunities to the right team.",
    endpoint: "/api/ai/lead-qualification",
    status: "planned",
  },
  {
    name: "WhatsApp Agent",
    purpose: "Client communication and follow-up automation through messaging channels.",
    endpoint: "/api/whatsapp/agent",
    status: "planned",
  },
  {
    name: "Proposal Generator",
    purpose: "Standardized proposal creation with dynamic pricing and service mapping.",
    endpoint: "/api/proposals/generate",
    status: "planned",
  },
  {
    name: "Legal AI Assistant",
    purpose: "Structured guidance for document and workflow assistance across legal processes.",
    endpoint: "/api/ai/legal-assistant",
    status: "planned",
  },
  {
    name: "CEO Dashboard",
    purpose: "Portfolio visibility across performance, leads, delivery and service health.",
    endpoint: "/api/dashboard/ceo",
    status: "in_review",
  },
];

export async function getFutureEcosystemIntegrations() {
  return futureEcosystemIntegrations;
}
