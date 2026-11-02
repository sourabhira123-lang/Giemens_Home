import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import { leadController } from "../server/lead-controller.ts";
import type { LeadSubmission, NewLead } from "../src/features/leads/model.ts";
import {
  LeadValidationError,
  validateLeadSubmission,
} from "../src/features/leads/validation.ts";

type ApiRequest = IncomingMessage & {
  body?: unknown;
  ip?: string;
};

type ApiResponse = ServerResponse & {
  statusCode: number;
};

type RateLimitResult = {
  success: boolean;
  reset: number;
};

type LeadHandlerDependencies = {
  checkRateLimit: (ip: string) => Promise<RateLimitResult>;
  captureLead: (input: NewLead) => Promise<{ id: string }>;
};

const maxBodyBytes = 12_000;

function applyHeaders(response: ApiResponse) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains; preload",
  );
}

function sendJson(
  response: ApiResponse,
  status: number,
  body: Record<string, unknown>,
) {
  response.statusCode = status;
  response.end(JSON.stringify(body));
}

function requestIp(request: ApiRequest): string | undefined {
  if (request.ip && isIP(request.ip)) return request.ip;
  const forwarded =
    request.headers["x-vercel-forwarded-for"] ??
    request.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const candidate = value?.split(",")[0]?.trim();
  return candidate && isIP(candidate) ? candidate : undefined;
}

function hasSameOrigin(request: ApiRequest): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  const host = request.headers.host;
  if (!host) return false;
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

function parseBody(request: ApiRequest): unknown {
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
    if (Buffer.byteLength(JSON.stringify(body), "utf8") > maxBodyBytes) {
      return undefined;
    }
  } catch {
    return undefined;
  }
  return body;
}

export function createLeadHandler({
  checkRateLimit,
  captureLead,
}: LeadHandlerDependencies) {
  return async function leadHandler(
    request: ApiRequest,
    response: ApiResponse,
  ): Promise<void> {
    applyHeaders(response);

    if (request.method === "GET" || request.method === "PATCH") {
      sendJson(response, 401, {
        error: "Lead management access is disabled until administrator authentication is configured.",
      });
      return;
    }
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "This request is not allowed." });
      return;
    }
    const contentType = request.headers["content-type"]
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();
    if (contentType !== "application/json") {
      sendJson(response, 415, { error: "Submit the inquiry as JSON." });
      return;
    }
    const contentLength = Number(request.headers["content-length"]);
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      sendJson(response, 413, { error: "The inquiry is too large." });
      return;
    }

    const body = parseBody(request);
    if (body === undefined) {
      sendJson(response, 400, { error: "Submit a valid inquiry under 12 KB." });
      return;
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      sendJson(response, 400, { error: "Submit a valid inquiry." });
      return;
    }
    const input = body as Record<string, unknown>;
    if (typeof input.website === "string" && input.website.trim()) {
      sendJson(response, 400, { error: "Check the inquiry details and try again." });
      return;
    }

    const ip = requestIp(request);
    if (!ip) {
      sendJson(response, 503, { error: "The lead service is temporarily unavailable." });
      return;
    }
    let limit: RateLimitResult;
    try {
      limit = await checkRateLimit(ip);
    } catch (error) {
      console.error(
        "Lead rate-limit service failed:",
        error instanceof Error ? error.name : "Unknown error",
      );
      sendJson(response, 503, { error: "The lead service is temporarily unavailable." });
      return;
    }
    if (!limit.success) {
      response.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000))),
      );
      sendJson(response, 429, { error: "Too many inquiries. Please try again later." });
      return;
    }

    let validatedInput: NewLead;
    try {
      const submission: LeadSubmission = {
        id: input.id,
        name: input.name,
        email: input.email,
        phone: input.phone,
        company: input.company,
        businessDivision: input.businessDivision,
        message: input.message,
        source: input.source,
        subject: input.subject,
        category: input.category,
      };
      validatedInput = validateLeadSubmission(submission);
    } catch (error) {
      if (error instanceof LeadValidationError) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      console.error(
        "Lead input validation failed:",
        error instanceof Error ? error.name : "Unknown error",
      );
      sendJson(response, 500, { error: "The inquiry could not be processed." });
      return;
    }

    try {
      const lead = await captureLead(validatedInput);
      sendJson(response, 201, { ok: true, id: lead.id });
    } catch (error) {
      console.error(
        "Lead persistence failed:",
        error instanceof Error ? error.name : "Unknown error",
      );
      sendJson(response, 503, { error: "The inquiry could not be saved. Please try again later." });
    }
  };
}

export default async function handler(
  request: ApiRequest,
  response: ApiResponse,
): Promise<void> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!redisUrl || !redisToken) {
    applyHeaders(response);
    console.error("Lead service rate-limit configuration is incomplete.");
    sendJson(response, 503, { error: "The lead service is temporarily unavailable." });
    return;
  }

  const redis = new Redis({ url: redisUrl, token: redisToken });
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "15 m"),
    prefix: "giemens:leads",
  });
  const leadHandler = createLeadHandler({
    checkRateLimit: async (ip) => {
      const result = await limiter.limit(ip);
      return { success: result.success, reset: result.reset };
    },
    captureLead: async (input) => leadController.capture(input),
  });
  await leadHandler(request, response);
}
