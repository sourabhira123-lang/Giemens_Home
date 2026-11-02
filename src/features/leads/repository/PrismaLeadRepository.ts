import {
  BusinessDivision as PrismaBusinessDivision,
  LeadStatus as PrismaLeadStatus,
  Prisma,
  type PrismaClient,
} from "@prisma/client";
import type { BusinessDivision, Lead, LeadStatus, NewLead } from "../model.ts";
import type { LeadRepository } from "./LeadRepository.ts";

const divisionToDomain: Record<PrismaBusinessDivision, BusinessDivision> = {
  JURIVANA: "Jurivana",
  TECHNOLOGY: "Technology",
  ENGINEERING: "Engineering",
  COMMERCE: "Commerce",
  CONSULTING: "Consulting",
  ACADEMY: "Academy",
  CORPORATE: "Corporate",
};

const divisionToPrisma: Record<BusinessDivision, PrismaBusinessDivision> = {
  Jurivana: PrismaBusinessDivision.JURIVANA,
  Technology: PrismaBusinessDivision.TECHNOLOGY,
  Engineering: PrismaBusinessDivision.ENGINEERING,
  Commerce: PrismaBusinessDivision.COMMERCE,
  Consulting: PrismaBusinessDivision.CONSULTING,
  Academy: PrismaBusinessDivision.ACADEMY,
  Corporate: PrismaBusinessDivision.CORPORATE,
};

const statusToDomain: Record<PrismaLeadStatus, LeadStatus> = {
  NEW: "NEW",
  CONTACTED: "CONTACTED",
  QUALIFIED: "QUALIFIED",
  PROPOSAL_SENT: "PROPOSAL_SENT",
  WON: "WON",
  LOST: "LOST",
};

const statusToPrisma: Record<LeadStatus, PrismaLeadStatus> = {
  NEW: PrismaLeadStatus.NEW,
  CONTACTED: PrismaLeadStatus.CONTACTED,
  QUALIFIED: PrismaLeadStatus.QUALIFIED,
  PROPOSAL_SENT: PrismaLeadStatus.PROPOSAL_SENT,
  WON: PrismaLeadStatus.WON,
  LOST: PrismaLeadStatus.LOST,
};

function toLead(record: Prisma.LeadGetPayload<{}>): Lead {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    ...(record.phone ? { phone: record.phone } : {}),
    ...(record.company ? { company: record.company } : {}),
    businessDivision: divisionToDomain[record.division],
    message: record.message,
    source: record.source,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    status: statusToDomain[record.status],
    subject: record.subject,
    category: record.category,
  };
}

export class PrismaLeadRepository implements LeadRepository {
  private readonly client: PrismaClient;

  constructor(client: PrismaClient) {
    this.client = client;
  }

  async list(): Promise<Lead[]> {
    const records = await this.client.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return records.map(toLead);
  }

  async findById(id: string): Promise<Lead | undefined> {
    const record = await this.client.lead.findUnique({ where: { id } });
    return record ? toLead(record) : undefined;
  }

  async create(input: NewLead): Promise<Lead> {
    const record = await this.client.lead.upsert({
      where: { id: input.id },
      create: {
        id: input.id,
        name: input.name,
        email: input.email,
        phone: input.phone,
        company: input.company,
        division: divisionToPrisma[input.businessDivision],
        message: input.message,
        source: input.source,
        status: input.status ? statusToPrisma[input.status] : PrismaLeadStatus.NEW,
        subject: input.subject,
        category: input.category,
        ...(input.createdAt ? { createdAt: new Date(input.createdAt) } : {}),
      },
      update: {},
    });
    return toLead(record);
  }

  async updateStatus(id: string, status: LeadStatus): Promise<Lead> {
    const record = await this.client.lead.update({
      where: { id },
      data: { status: statusToPrisma[status] },
    });
    return toLead(record);
  }
}
