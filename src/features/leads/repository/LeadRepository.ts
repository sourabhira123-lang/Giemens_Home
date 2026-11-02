import type { Lead, LeadStatus, NewLead } from "../model.ts";

export interface LeadRepository {
  list(): Promise<Lead[]>;
  findById(id: string): Promise<Lead | undefined>;
  create(lead: NewLead): Promise<Lead>;
  updateStatus(id: string, status: LeadStatus): Promise<Lead>;
}
