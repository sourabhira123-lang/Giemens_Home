import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { createLeadHandler } from "../api/leads.ts";
import type { LeadSubmission, NewLead } from "../src/features/leads/model.ts";
import type { AuthenticatedUser } from "../server/auth.ts";

const validSubmission: LeadSubmission = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Example Sender",
  email: "sender@example.com",
  phone: "+14155552671",
  company: "Example Organization",
  businessDivision: "Jurivana",
  message: "I would like to learn more about your services.",
  source: "jurivana_inquiry",
  subject: "A question",
  category: "Legal, Property & Compliance",
};

function makeRequest(
  overrides: Partial<{
    method: string;
    body: unknown;
    headers: IncomingHttpHeaders;
    ip: string;
  }> = {},
) {
  return {
    method: "POST",
    body: validSubmission,
    ip: "203.0.113.12",
    headers: {
      host: "example.test",
      origin: "https://example.test",
      "content-type": "application/json; charset=utf-8",
    },
    ...overrides,
  } as IncomingMessage & { body?: unknown; ip?: string };
}

function makeResponse() {
  const headers: Record<string, string> = {};
  let responseBody = "";
  const response = {
    statusCode: 200,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    end(value?: string) {
      responseBody = value ?? "";
      return this;
    },
  } as unknown as ServerResponse & { statusCode: number };
  return {
    response,
    headers,
    get body() {
      return JSON.parse(responseBody) as Record<string, unknown>;
    },
  };
}

function makeHandler(
  captureLead: (input: NewLead) => Promise<{ id: string }> = async (input) => ({
    id: input.id,
  }),
  authenticatedUser?: AuthenticatedUser,
  persistLead = true,
) {
  const captured: NewLead[] = [];
  const handler = createLeadHandler({
    persistLead,
    checkRateLimit: async () => ({ success: true, reset: Date.now() + 60_000 }),
    captureLead: async (input) => {
      captured.push(input);
      return captureLead(input);
    },
    authenticate: async () => authenticatedUser,
    listLeads: async () => [],
    updateLeadStatus: async (id, status) => ({ id, status }),
  });
  return { handler, captured };
}

test("stores a validated lead and returns its persistence status", async () => {
  const { handler, captured } = makeHandler();
  const output = makeResponse();
  await handler(makeRequest(), output.response);

  assert.equal(output.response.statusCode, 201);
  assert.equal(output.body.ok, true);
  assert.equal(output.body.success, true);
  assert.equal(output.body.id, validSubmission.id);
  assert.equal(output.body.persisted, true);
  assert.equal(output.body.message, "Inquiry received successfully.");
  assert.equal(captured[0].businessDivision, "Jurivana");
  assert.equal(captured[0].status, undefined);
  assert.equal(output.headers["cache-control"], "no-store");
});

test("accepts a validated inquiry without persistence when disabled", async () => {
  const { handler, captured } = makeHandler(async () => {
    throw new Error("Prisma should not run while persistence is disabled.");
  }, undefined, false);
  const output = makeResponse();
  await handler(makeRequest(), output.response);

  assert.equal(output.response.statusCode, 201);
  assert.deepEqual(output.body, {
    ok: true,
    success: true,
    id: validSubmission.id,
    persisted: false,
    message: "Inquiry received successfully.",
  });
  assert.equal(captured.length, 0);
});

test("continues accepting an inquiry if enabled lead persistence is unavailable", async () => {
  const { handler } = makeHandler(async () => {
    throw new Error("Prisma table does not exist.");
  });
  const output = makeResponse();
  await handler(makeRequest(), output.response);

  assert.equal(output.response.statusCode, 201);
  assert.deepEqual(output.body, {
    ok: true,
    success: true,
    id: validSubmission.id,
    persisted: false,
    message: "Inquiry received successfully.",
  });
});

test("rejects invalid submissions before persistence", async () => {
  const { handler, captured } = makeHandler();
  const output = makeResponse();
  await handler(
    makeRequest({ body: { ...validSubmission, email: "invalid" } }),
    output.response,
  );

  assert.equal(output.response.statusCode, 400);
  assert.equal(captured.length, 0);
});

test("preserves validation when persistence is disabled", async () => {
  const { handler, captured } = makeHandler(undefined, undefined, false);
  const output = makeResponse();
  await handler(
    makeRequest({ body: { ...validSubmission, email: "invalid" } }),
    output.response,
  );

  assert.equal(output.response.statusCode, 400);
  assert.equal(captured.length, 0);
});

test("does not expose lead reads or status changes before authentication", async () => {
  const { handler, captured } = makeHandler();
  for (const method of ["GET", "PATCH"]) {
    const output = makeResponse();
    await handler(makeRequest({ method }), output.response);
    assert.equal(output.response.statusCode, 401);
  }
  assert.equal(captured.length, 0);
});

test("allows only SUPER_ADMIN and ADMIN to read lead records", async () => {
  const employee: AuthenticatedUser = {
    id: "00000000-0000-4000-8000-000000000010",
    email: "employee@example.com",
    name: "Employee",
    role: "EMPLOYEE",
  };
  const denied = makeResponse();
  await makeHandler(undefined, employee).handler(
    makeRequest({ method: "GET" }),
    denied.response,
  );
  assert.equal(denied.response.statusCode, 403);

  const admin: AuthenticatedUser = { ...employee, role: "ADMIN" };
  const allowed = makeResponse();
  await makeHandler(undefined, admin).handler(
    makeRequest({ method: "GET" }),
    allowed.response,
  );
  assert.equal(allowed.response.statusCode, 200);
  assert.deepEqual(allowed.body.leads, []);
});

test("requires same-origin lead status updates and administrator role", async () => {
  const admin: AuthenticatedUser = {
    id: "00000000-0000-4000-8000-000000000010",
    email: "admin@example.com",
    name: "Admin",
    role: "SUPER_ADMIN",
  };
  const output = makeResponse();
  const request = makeRequest({
    method: "PATCH",
    body: {
      id: validSubmission.id,
      status: "QUALIFIED",
    },
  });
  const { handler } = makeHandler(undefined, admin);
  await handler(request, output.response);
  assert.equal(output.response.statusCode, 200);
  assert.equal((output.body.lead as { status: string }).status, "QUALIFIED");
});

test("rejects cross-origin lead submissions", async () => {
  const { handler, captured } = makeHandler();
  const output = makeResponse();
  await handler(
    makeRequest({
      headers: {
        host: "example.test",
        origin: "https://attacker.test",
        "content-type": "application/json",
      },
    }),
    output.response,
  );
  assert.equal(output.response.statusCode, 403);
  assert.equal(captured.length, 0);
});
