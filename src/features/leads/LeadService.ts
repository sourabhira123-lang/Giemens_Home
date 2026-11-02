import type { Lead, LeadStatus, LeadSubmission } from "./model.ts";
import type { LeadRepository } from "./repository/LeadRepository.ts";
import { validateLeadSubmission } from "./validation.ts";

export class LeadService {
  private readonly repository: LeadRepository;

  constructor(repository: LeadRepository) {
    this.repository = repository;
  }

  async capture(input: LeadSubmission): Promise<Lead> {
    return this.repository.create(validateLeadSubmission(input));
  }

  list(): Promise<Lead[]> {
    return this.repository.list();
  }

  findById(id: string): Promise<Lead | undefined> {
    return this.repository.findById(id);
  }

  updateStatus(id: string, status: LeadStatus): Promise<Lead> {
    return this.repository.updateStatus(id, status);
  }
}
