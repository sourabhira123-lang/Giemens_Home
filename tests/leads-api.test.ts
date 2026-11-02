import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { createLeadHandler } from "../api/leads.ts";
import type { LeadSubmission, NewLead } from "../src/features/leads/model.ts";

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
) {
  const captured: NewLead[] = [];
  const handler = createLeadHandler({
    checkRateLimit: async () => ({ success: true, reset: Date.now() + 60_000 }),
    captureLead: async (input) => {
      captured.push(input);
      return captureLead(input);
    },
  });
  return { handler, captured };
}

test("stores a validated lead and returns only its identifier", async () => {
  const { handler, captured } = makeHandler();
  const output = makeResponse();
  await handler(makeRequest(), output.response);

  assert.equal(output.response.statusCode, 201);
  assert.equal(output.body.ok, true);
  assert.equal(output.body.id, validSubmission.id);
  assert.deepEqual(Object.keys(output.body).sort(), ["id", "ok"]);
  assert.equal(captured[0].businessDivision, "Jurivana");
  assert.equal(captured[0].status, undefined);
  assert.equal(output.headers["cache-control"], "no-store");
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

test("does not expose lead reads or status changes before authentication", async () => {
  const { handler, captured } = makeHandler();
  for (const method of ["GET", "PATCH"]) {
    const output = makeResponse();
    await handler(makeRequest({ method }), output.response);
    assert.equal(output.response.statusCode, 401);
  }
  assert.equal(captured.length, 0);
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
