import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { createCrmHandler } from "../api/crm.ts";
import type { AuthenticatedUser } from "../server/auth.ts";

function makeRequest(
  method: string,
  url: string,
  body?: unknown,
  headers: IncomingHttpHeaders = {},
) {
  return {
    method,
    url,
    body,
    headers: {
      host: "example.test",
      origin: "https://example.test",
      "content-type": "application/json",
      ...headers,
    },
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

const employee: AuthenticatedUser = {
  id: "2f9f8ce2-1433-4f41-8101-c0bf03052f77",
  email: "employee@example.test",
  name: "Example Employee",
  role: "EMPLOYEE",
};

const manager: AuthenticatedUser = {
  ...employee,
  role: "MANAGER",
};

test("CRM endpoint requires an authenticated user", async () => {
  const handler = createCrmHandler({ authenticate: async () => undefined });
  const output = makeResponse();
  await handler(makeRequest("GET", "/api/crm?resource=customers"), output.response);
  assert.equal(output.response.statusCode, 401);
});

test("employees cannot create CRM records", async () => {
  const handler = createCrmHandler({ authenticate: async () => employee });
  const output = makeResponse();
  await handler(
    makeRequest("POST", "/api/crm?resource=customers", { name: "Example Customer" }),
    output.response,
  );
  assert.equal(output.response.statusCode, 403);
});

test("CRM rejects cross-origin mutations before accessing records", async () => {
  const handler = createCrmHandler({ authenticate: async () => manager });
  const output = makeResponse();
  await handler(
    makeRequest(
      "POST",
      "/api/crm?resource=customers",
      { name: "Example Customer" },
      { origin: "https://untrusted.example" },
    ),
    output.response,
  );
  assert.equal(output.response.statusCode, 403);
});

test("only administrators can assign Jurivana requests", async () => {
  const handler = createCrmHandler({ authenticate: async () => manager });
  const output = makeResponse();
  await handler(
    makeRequest("PATCH", "/api/crm?resource=requests", {
        id: "2f9f8ce2-1433-4f41-8101-c0bf03052f77",
        action: "assign",
        assignedToId: null,
      }),
    output.response,
  );
  assert.equal(output.response.statusCode, 403);
});

test("employees cannot assign requests", async () => {
  const handler = createCrmHandler({ authenticate: async () => employee });
  const output = makeResponse();
  await handler(
    makeRequest("PATCH", "/api/crm?resource=requests", {
        id: "2f9f8ce2-1433-4f41-8101-c0bf03052f77",
        action: "assign",
        assignedToId: null,
      }),
    output.response,
  );
  assert.equal(output.response.statusCode, 403);
});

test("employees cannot read lead activity records", async () => {
  const handler = createCrmHandler({ authenticate: async () => employee });
  const output = makeResponse();
  await handler(
    makeRequest("GET", "/api/crm?resource=activities"),
    output.response,
  );
  assert.equal(output.response.statusCode, 403);
});
