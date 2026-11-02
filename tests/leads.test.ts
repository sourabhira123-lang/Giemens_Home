import assert from "node:assert/strict";
import { test } from "node:test";
import { getLeadMetrics, getBusinessDivision } from "../src/features/leads/leadManagement.ts";
import type { Lead } from "../src/features/leads/model.ts";
import { PrismaLeadRepository } from "../src/features/leads/repository/PrismaLeadRepository.ts";
import { validateLeadSubmission } from "../src/features/leads/validation.ts";
import type { PrismaClient } from "@prisma/client";

const validSubmission = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Example Sender",
  email: "sender@example.com",
  phone: "+1 (415) 555-2671",
  company: "Example Organization",
  businessDivision: "Jurivana",
  message: "I would like to learn more about your services.",
  source: "jurivana_inquiry",
  subject: "A question",
  category: "Legal, Property & Compliance",
};

test("validates and normalizes a lead submission", () => {
  const lead = validateLeadSubmission(validSubmission);
  assert.equal(lead.name, "Example Sender");
  assert.equal(lead.email, "sender@example.com");
  assert.equal(lead.phone, "+14155552671");
  assert.equal(lead.businessDivision, "Jurivana");
  assert.equal(lead.status, undefined);
});

test("rejects invalid lead fields", () => {
  for (const submission of [
    { ...validSubmission, email: "invalid" },
    { ...validSubmission, name: "x" },
    { ...validSubmission, phone: "123" },
    { ...validSubmission, message: "short" },
    { ...validSubmission, businessDivision: "Unknown" },
    { ...validSubmission, source: "x".repeat(101) },
    { ...validSubmission, id: "not-a-uuid" },
  ]) {
    assert.throws(() => validateLeadSubmission(submission));
  }
});

test("maps domain lead values to Prisma enums when persisting", async () => {
  let createData: Record<string, unknown> | undefined;
  const record = {
    ...validateLeadSubmission(validSubmission),
    division: "JURIVANA",
    status: "NEW",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
  const repository = new PrismaLeadRepository({
    lead: {
      upsert: async (args: { create: Record<string, unknown> }) => {
        createData = args.create;
        return record;
      },
    },
  } as unknown as PrismaClient);

  const lead = await repository.create(validateLeadSubmission(validSubmission));
  assert.equal(createData?.division, "JURIVANA");
  assert.equal(createData?.status, "NEW");
  assert.equal(lead.businessDivision, "Jurivana");
});

test("uses a route-provided division for Jurivana inquiries", () => {
  assert.equal(
    getBusinessDivision("Technology Solutions", "Jurivana"),
    "Jurivana",
  );
  assert.equal(getBusinessDivision("Engineering & Infrastructure"), "Engineering");
});

test("calculates lead counts and returns the five most recent leads", () => {
  const leads = Array.from({ length: 7 }, (_, index) => ({
    ...validateLeadSubmission({
      ...validSubmission,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      name: `Sender ${index}`,
    }),
    status: index === 0 ? "QUALIFIED" : "NEW",
    createdAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
  })) as Lead[];

  const metrics = getLeadMetrics(leads);
  assert.equal(metrics.total, 7);
  assert.equal(metrics.new, 6);
  assert.equal(metrics.qualified, 1);
  assert.equal(metrics.recent.length, 5);
  assert.equal(metrics.recent[0].id, "00000000-0000-4000-8000-000000000006");
});
