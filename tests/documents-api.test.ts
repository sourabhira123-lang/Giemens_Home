import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { createDocumentsHandler } from "../api/documents.ts";
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
  } as IncomingMessage & { body?: unknown };
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

const user: AuthenticatedUser = {
  id: "2f9f8ce2-1433-4f41-8101-c0bf03052f77",
  email: "employee@example.test",
  name: "Example Employee",
  role: "EMPLOYEE",
};

test("document API requires an authenticated user", async () => {
  const handler = createDocumentsHandler({ authenticate: async () => undefined });
  const output = makeResponse();
  await handler(makeRequest("GET", "/api/documents"), output.response);
  assert.equal(output.response.statusCode, 401);
});

test("document upload requests require same-origin JSON", async () => {
  const handler = createDocumentsHandler({ authenticate: async () => user });
  const wrongOrigin = makeResponse();
  await handler(
    makeRequest(
      "POST",
      "/api/documents",
      { action: "initiate" },
      { origin: "https://untrusted.example" },
    ),
    wrongOrigin.response,
  );
  assert.equal(wrongOrigin.response.statusCode, 403);

  const wrongType = makeResponse();
  await handler(
    makeRequest("POST", "/api/documents", { action: "initiate" }, { "content-type": "text/plain" }),
    wrongType.response,
  );
  assert.equal(wrongType.response.statusCode, 415);
});

test("document upload validates file type before requesting storage credentials", async () => {
  let rateLimitCalled = false;
  const handler = createDocumentsHandler({
    authenticate: async () => user,
    checkUploadRateLimit: async () => {
      rateLimitCalled = true;
      return { success: true, reset: Date.now() + 60_000 };
    },
  });
  const output = makeResponse();
  await handler(
    makeRequest("POST", "/api/documents", {
      action: "initiate",
      fileName: "payload.txt",
      contentType: "text/plain",
      sizeBytes: 12,
      checksumSha256: "a".repeat(64),
      category: "CLIENT_ATTACHMENT",
    }),
    output.response,
  );
  assert.equal(output.response.statusCode, 400);
  assert.equal(rateLimitCalled, false);
});

test("document lookup rejects malformed identifiers", async () => {
  const handler = createDocumentsHandler({ authenticate: async () => user });
  const output = makeResponse();
  await handler(makeRequest("GET", "/api/documents?id=not-a-uuid"), output.response);
  assert.equal(output.response.statusCode, 400);
});
