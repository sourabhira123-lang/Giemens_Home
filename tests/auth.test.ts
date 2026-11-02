import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import type { PrismaClient } from "@prisma/client";
import { createLoginHandler } from "../api/auth/login.ts";
import { hashPassword, verifyPassword } from "../server/password.ts";
import {
  createSession,
  getAuthenticatedUser,
  revokeSession,
} from "../server/auth.ts";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "admin@giemens.local",
  name: "GIEMENS Admin",
  passwordHash: "stored-hash",
  role: { name: "SUPER_ADMIN" },
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
    body: { email: user.email, password: "A-secure-local-password-123!" },
    ip: "203.0.113.12",
    headers: {
      host: "example.test",
      origin: "https://example.test",
      "content-type": "application/json",
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

function makeHandler(overrides: {
  user?: typeof user | null;
  passwordMatches?: boolean;
  failures?: number;
  rateLimited?: boolean;
  isProduction?: boolean;
} = {}) {
  const failures: string[] = [];
  const handler = createLoginHandler({
    findUser: async () => overrides.user === undefined ? user : overrides.user,
    verifyPassword: async () => overrides.passwordMatches ?? true,
    isRateLimited: async () => overrides.rateLimited ?? false,
    recordFailure: async (ip) => {
      failures.push(ip);
      return overrides.failures ?? failures.length;
    },
    clearFailures: async () => undefined,
    createSession: async () => ({
      token: "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    }),
    isProduction: overrides.isProduction ?? true,
  });
  return { handler, failures };
}

test("hashes passwords with scrypt and verifies without storing plaintext", async () => {
  const password = "A-secure-local-password-123!";
  const encoded = await hashPassword(password);
  assert.match(encoded, /^scrypt\$16384\$8\$1\$/);
  assert.equal(encoded.includes(password), false);
  assert.equal(await verifyPassword(password, encoded), true);
  assert.equal(await verifyPassword("wrong-password", encoded), false);
  assert.equal(await verifyPassword(password, null), false);
  await assert.rejects(() => hashPassword("short"));
});

test("creates an HttpOnly Secure SameSite session after valid login", async () => {
  const output = makeResponse();
  await makeHandler({ isProduction: true }).handler(makeRequest(), output.response);
  assert.equal(output.response.statusCode, 200);
  assert.equal(output.body.authenticated, true);
  assert.equal(
    output.headers["set-cookie"]?.includes("HttpOnly; SameSite=Lax; Path=/"),
    true,
  );
  assert.equal(output.headers["set-cookie"]?.includes("Secure"), true);
  assert.equal(JSON.stringify(output.body).includes("password"), false);
});

test("uses a generic response and records failed sign-in attempts", async () => {
  const output = makeResponse();
  const { handler, failures } = makeHandler({ passwordMatches: false });
  await handler(makeRequest(), output.response);
  assert.equal(output.response.statusCode, 401);
  assert.deepEqual(output.body, { error: "Email or password is incorrect." });
  assert.deepEqual(failures, ["203.0.113.12"]);
});

test("rejects cross-origin and rate-limited logins", async () => {
  const crossOrigin = makeResponse();
  await makeHandler().handler(
    makeRequest({
      headers: {
        host: "example.test",
        origin: "https://attacker.test",
        "content-type": "application/json",
      },
    }),
    crossOrigin.response,
  );
  assert.equal(crossOrigin.response.statusCode, 403);

  const rateLimited = makeResponse();
  await makeHandler({ rateLimited: true }).handler(
    makeRequest(),
    rateLimited.response,
  );
  assert.equal(rateLimited.response.statusCode, 429);
  assert.equal(rateLimited.headers["retry-after"], "900");
});

test("returns the same credential error for missing user and unsupported role", async () => {
  for (const candidate of [
    null,
    { ...user, role: { name: "UNKNOWN" } },
  ]) {
    const output = makeResponse();
    await makeHandler({ user: candidate }).handler(makeRequest(), output.response);
    assert.equal(output.response.statusCode, 401);
    assert.deepEqual(output.body, { error: "Email or password is incorrect." });
  }
});

test("persists only a token hash and resolves the user role from PostgreSQL", async () => {
  let createdSession: Record<string, unknown> | undefined;
  const sessionId = "00000000-0000-4000-8000-000000000002";
  const database = {
    session: {
      create: async (args: { data: Record<string, unknown> }) => {
        createdSession = args.data;
        return { id: sessionId };
      },
      findUnique: async () => ({
        id: sessionId,
        expiresAt: new Date("2027-01-01T00:00:00.000Z"),
        user: { ...user, role: { name: "ADMIN" } },
      }),
      delete: async () => undefined,
      deleteMany: async () => ({ count: 1 }),
    },
  } as unknown as PrismaClient;
  const issued = await createSession(user.id, database, new Date("2026-01-01T00:00:00.000Z"));

  assert.match(issued.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(
    createdSession?.tokenHash,
    createHash("sha256").update(issued.token).digest("hex"),
  );
  assert.notEqual(createdSession?.tokenHash, issued.token);
  assert.equal(
    issued.expiresAt.toISOString(),
    "2026-01-01T08:00:00.000Z",
  );

  const request = {
    headers: { cookie: `giemens_session=${issued.token}` },
  } as IncomingMessage;
  const currentUser = await getAuthenticatedUser(
    request,
    database,
    new Date("2026-01-01T01:00:00.000Z"),
  );
  assert.deepEqual(currentUser, {
    id: user.id,
    email: user.email,
    name: user.name,
    role: "ADMIN",
  });
  await revokeSession(request, database);
});
