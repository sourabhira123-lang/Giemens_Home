import type { IncomingMessage, ServerResponse } from "node:http";
import {
  authRoles,
  clearLoginFailures,
  createSession,
  findUserForLogin,
  getClientIp,
  hasSameOrigin,
  isLoginRateLimited,
  recordLoginFailure,
  sessionCookieName,
} from "../../server/auth.ts";
import { verifyPassword } from "../../server/password.ts";

type AuthRequest = IncomingMessage & {
  body?: unknown;
  ip?: string;
};

type AuthResponse = ServerResponse & {
  statusCode: number;
};

type LoginUser = {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  role: { name: string };
};

type LoginDependencies = {
  findUser: (email: string) => Promise<LoginUser | null>;
  verifyPassword: (password: string, hash: string | null) => Promise<boolean>;
  isRateLimited: (ip: string) => Promise<boolean>;
  recordFailure: (ip: string) => Promise<number>;
  clearFailures: (ip: string) => Promise<void>;
  createSession: (userId: string) => Promise<{ token: string; expiresAt: Date }>;
  isProduction: boolean;
};

const maxBodyBytes = 4_000;
const maxLoginAttempts = 5;

function sendJson(
  response: AuthResponse,
  status: number,
  body: Record<string, unknown>,
) {
  response.statusCode = status;
  response.end(JSON.stringify(body));
}

function applyHeaders(response: AuthResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
}

function parseBody(request: AuthRequest): unknown {
  const body = request.body;
  if (typeof body === "string") {
    if (Buffer.byteLength(body, "utf8") > maxBodyBytes) return undefined;
    try {
      return JSON.parse(body) as unknown;
    } catch {
      return undefined;
    }
  }
  if (Buffer.isBuffer(body)) {
    if (body.byteLength > maxBodyBytes) return undefined;
    try {
      return JSON.parse(body.toString("utf8")) as unknown;
    } catch {
      return undefined;
    }
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return undefined;
  }
  try {
    return Buffer.byteLength(JSON.stringify(body), "utf8") <= maxBodyBytes
      ? body
      : undefined;
  } catch {
    return undefined;
  }
}

function cookieValue(
  token: string,
  expiresAt: Date,
  isProduction: boolean,
): string {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return [
    `${sessionCookieName}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
    ...(isProduction ? ["Secure"] : []),
  ].join("; ");
}

export function createLoginHandler(dependencies: LoginDependencies) {
  return async function loginHandler(
    request: AuthRequest,
    response: AuthResponse,
  ): Promise<void> {
    applyHeaders(response);
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "This request is not allowed." });
      return;
    }
    if (
      request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !==
      "application/json"
    ) {
      sendJson(response, 415, { error: "Submit credentials as JSON." });
      return;
    }
    const body = parseBody(request);
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      sendJson(response, 400, { error: "Enter a valid email address and password." });
      return;
    }

    const input = body as Record<string, unknown>;
    const email =
      typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (
      email.length > 254 ||
      !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
      !password ||
      Buffer.byteLength(password, "utf8") > 128
    ) {
      sendJson(response, 400, { error: "Enter a valid email address and password." });
      return;
    }

    const ip =
      getClientIp(request) ??
      (process.env.NODE_ENV === "production" ? undefined : "local");
    if (!ip) {
      sendJson(response, 503, { error: "Sign-in is temporarily unavailable." });
      return;
    }

    try {
      if (await dependencies.isRateLimited(ip)) {
        response.setHeader("Retry-After", "900");
        sendJson(response, 429, { error: "Too many sign-in attempts. Try again later." });
        return;
      }

      const user = await dependencies.findUser(email);
      const passwordValid = await dependencies.verifyPassword(
        password,
        user?.passwordHash ?? null,
      );
      if (
        !user ||
        !passwordValid ||
        !authRoles.includes(user.role.name as (typeof authRoles)[number])
      ) {
        const failures = await dependencies.recordFailure(ip);
        if (failures >= maxLoginAttempts) {
          response.setHeader("Retry-After", "900");
          sendJson(response, 429, { error: "Too many sign-in attempts. Try again later." });
          return;
        }
        sendJson(response, 401, { error: "Email or password is incorrect." });
        return;
      }

      const session = await dependencies.createSession(user.id);
      await dependencies.clearFailures(ip);
      response.setHeader(
        "Set-Cookie",
        cookieValue(session.token, session.expiresAt, dependencies.isProduction),
      );
      sendJson(response, 200, {
        authenticated: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role.name },
      });
    } catch (error) {
      console.error(
        "Authentication request failed:",
        error instanceof Error ? error.name : "UnknownError",
      );
      sendJson(response, 503, { error: "Sign-in is temporarily unavailable." });
    }
  };
}

const loginHandler = createLoginHandler({
  findUser: findUserForLogin,
  verifyPassword,
  isRateLimited: isLoginRateLimited,
  recordFailure: recordLoginFailure,
  clearFailures: clearLoginFailures,
  createSession,
  isProduction: process.env.NODE_ENV === "production",
});

export default loginHandler;
