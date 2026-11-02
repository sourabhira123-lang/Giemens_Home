import { LeadController } from "../src/features/leads/LeadController.ts";
import { LeadService } from "../src/features/leads/LeadService.ts";
import { PrismaLeadRepository } from "../src/features/leads/repository/PrismaLeadRepository.ts";
import { prisma } from "./prisma.ts";

export const leadController = new LeadController(
  new LeadService(new PrismaLeadRepository(prisma)),
);
