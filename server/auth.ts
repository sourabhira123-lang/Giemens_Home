import { createHash, createHmac, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import {
  type Prisma,
  type PrismaClient,
} from "@prisma/client";
import { prisma } from "./prisma.ts";

export const authRoles = [
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "EMPLOYEE",
] as const;

export type AuthRole = (typeof authRoles)[number];

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
};

export type SessionRequest = IncomingMessage & {
  ip?: string;
};

export const sessionCookieName = "giemens_session";
export const sessionDurationMs = 8 * 60 * 60 * 1000;
const loginWindowMs = 15 * 60 * 1000;
const loginAttemptLimit = 5;

function isAuthRole(value: string): value is AuthRole {
  return authRoles.includes(value as AuthRole);
}

function getSessionToken(request: SessionRequest): string | undefined {
  const cookie = request.headers.cookie;
  if (!cookie) return undefined;
  const value = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookieName}=`))
    ?.slice(sessionCookieName.length + 1);
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function rateLimitKey(ipAddress: string): string {
  const secret = process.env.AUTH_RATE_LIMIT_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("AUTH_RATE_LIMIT_SECRET is missing or too short.");
  }
  return createHmac("sha256", secret).update(ipAddress).digest("hex");
}

type AuthDatabase = PrismaClient;

export async function findUserForLogin(email: string, database: AuthDatabase = prisma) {
  return database.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      passwordHash: true,
      role: { select: { name: true } },
    },
  });
}

export async function isLoginRateLimited(
  ipAddress: string,
  database: AuthDatabase = prisma,
  now = new Date(),
): Promise<boolean> {
  const current = await database.authRateLimit.findUnique({
    where: { keyHash: rateLimitKey(ipAddress) },
  });
  return Boolean(
    current &&
      current.windowStartedAt.getTime() > now.getTime() - loginWindowMs &&
      current.attempts >= loginAttemptLimit,
  );
}

export async function recordLoginFailure(
  ipAddress: string,
  database: AuthDatabase = prisma,
  now = new Date(),
): Promise<number> {
  const keyHash = rateLimitKey(ipAddress);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const attempts = await database.$transaction(async (transaction) => {
        const current = await transaction.authRateLimit.findUnique({
          where: { keyHash },
        });
        if (!current) {
          const created = await transaction.authRateLimit.create({
            data: { keyHash, attempts: 1, windowStartedAt: now },
          });
          return created.attempts;
        }

        if (current.windowStartedAt.getTime() <= now.getTime() - loginWindowMs) {
          const reset = await transaction.authRateLimit.updateMany({
            where: { keyHash, windowStartedAt: current.windowStartedAt },
            data: { attempts: 1, windowStartedAt: now },
          });
          if (reset.count === 0) return undefined;
          return 1;
        }

        const updated = await transaction.authRateLimit.update({
          where: { keyHash },
          data: { attempts: { increment: 1 } },
          select: { attempts: true },
        });
        return updated.attempts;
      });
      if (attempts !== undefined) {
        await database.authRateLimit.deleteMany({
          where: {
            windowStartedAt: {
              lt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
            },
          },
        });
        return attempts;
      }
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;
      if (code !== "P2002" && code !== "P2034" && code !== "P2025") throw error;
    }
  }
  throw new Error("Could not update the login rate limit.");
}

export async function clearLoginFailures(
  ipAddress: string,
  database: AuthDatabase = prisma,
): Promise<void> {
  await database.authRateLimit.deleteMany({
    where: { keyHash: rateLimitKey(ipAddress) },
  });
}

export async function createSession(
  userId: string,
  database: AuthDatabase = prisma,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + sessionDurationMs);
  await database.session.deleteMany({
    where: { expiresAt: { lte: now } },
  });
  await database.session.create({
    data: { tokenHash: tokenHash(token), userId, expiresAt },
  });
  return { token, expiresAt };
}

export async function getAuthenticatedUser(
  request: SessionRequest,
  database: AuthDatabase = prisma,
  now = new Date(),
): Promise<AuthenticatedUser | undefined> {
  const token = getSessionToken(request);
  if (!token) return undefined;

  const session = await database.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: { include: { role: true } } },
  });
  if (!session) return undefined;
  if (session.expiresAt.getTime() <= now.getTime()) {
    await database.session.deleteMany({ where: { id: session.id } });
    return undefined;
  }
  if (!isAuthRole(session.user.role.name)) return undefined;

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role.name,
  };
}

export async function revokeSession(
  request: SessionRequest,
  database: AuthDatabase = prisma,
): Promise<void> {
  const token = getSessionToken(request);
  if (!token) return;
  await database.session.deleteMany({
    where: { tokenHash: tokenHash(token) },
  });
}

export function getClientIp(request: SessionRequest): string | undefined {
  if (request.ip && isIP(request.ip)) return request.ip;
  const forwarded = request.headers["x-vercel-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const candidate = value?.split(",")[0]?.trim();
  return candidate && isIP(candidate) ? candidate : undefined;
}

export function hasSameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return false;
  try {
    const parsedOrigin = new URL(origin);
    return (
      (parsedOrigin.protocol === "https:" || parsedOrigin.protocol === "http:") &&
      parsedOrigin.host.toLowerCase() === host.toLowerCase()
    );
  } catch {
    return false;
  }
}

export function isAdminRole(role: AuthRole): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

export function isPrismaNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as Prisma.PrismaClientKnownRequestError).code === "P2025"
  );
}
