import type { Lead, LeadStatus, LeadSubmission } from "./model.ts";
import type { LeadService } from "./LeadService.ts";

export class LeadController {
  private readonly service: LeadService;

  constructor(service: LeadService) {
    this.service = service;
  }

  capture(input: LeadSubmission): Promise<Lead> {
    return this.service.capture(input);
  }

  list(): Promise<Lead[]> {
    return this.service.list();
  }

  findById(id: string): Promise<Lead | undefined> {
    return this.service.findById(id);
  }

  updateStatus(id: string, status: LeadStatus): Promise<Lead> {
    return this.service.updateStatus(id, status);
  }
}
