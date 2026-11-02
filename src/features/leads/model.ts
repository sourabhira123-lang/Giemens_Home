export const leadStatuses = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL_SENT",
  "WON",
  "LOST",
] as const;

export type LeadStatus = (typeof leadStatuses)[number];

export const businessDivisions = [
  "Jurivana",
  "Technology",
  "Engineering",
  "Commerce",
  "Consulting",
  "Academy",
  "Corporate",
] as const;

export type BusinessDivision = (typeof businessDivisions)[number];

export type Lead = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  businessDivision: BusinessDivision;
  message: string;
  source: string;
  createdAt: string;
  status: LeadStatus;
  subject: string;
  category: string;
  updatedAt: string;
}

export type NewLead = Omit<Lead, "createdAt" | "updatedAt" | "status"> & {
  createdAt?: string;
  status?: LeadStatus;
};

export type LeadSubmission = {
  id?: unknown;
  name: unknown;
  email: unknown;
  phone?: unknown;
  company?: unknown;
  businessDivision: unknown;
  message: unknown;
  source: unknown;
  subject: unknown;
  category: unknown;
};
