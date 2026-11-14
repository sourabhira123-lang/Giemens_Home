import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isIP } from "node:net";
import {
  isValidEmail,
  validateContactPayload,
  type ContactInquiry,
} from "../server/contact-validation.ts";
import {
  createEmailProvider,
  EmailService,
  resolveSmtpSettings,
} from "../server/email-service.ts";
import {
  buildContactAutoReplyEmail,
  buildContactNotificationEmail,
} from "../server/email-templates.ts";
import { createInMemoryRateLimiter } from "../server/in-memory-rate-limit.ts";
import { logEvent, recordEmailDelivery } from "../server/observability.ts";

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

type ContactHandlerDependencies = {
  checkRateLimit: (ip: string) => Promise<RateLimitResult>;
  sendEmail?: (inquiry: ContactInquiry) => Promise<boolean>;
  sendAutoReply?: (inquiry: ContactInquiry) => Promise<boolean>;
  enableAutoReply?: boolean;
};

const maxBodyBytes = 12_000;
const fallbackRateLimit = createInMemoryRateLimiter(5, 15 * 60 * 1000);
let loggedSmtpDisabled = false;
let loggedRedisDisabled = false;

function applySecurityHeaders(response: ApiResponse) {
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
  if (request.ip && isIP(request.ip)) {
    return request.ip;
  }
  const forwarded = request.headers["x-vercel-forwarded-for"];
  const cloudflare = request.headers["cf-connecting-ip"];
  const fallback = request.headers["x-forwarded-for"];
  const header = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded ?? (Array.isArray(cloudflare)
      ? cloudflare[0]
      : cloudflare ?? (Array.isArray(fallback) ? fallback[0] : fallback));
  const candidate = header?.split(",")[0]?.trim();
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

export function createContactHandler({
  checkRateLimit,
  sendEmail,
  sendAutoReply,
  enableAutoReply = false,
}: ContactHandlerDependencies) {
  return async function contactHandler(
    request: ApiRequest,
    response: ApiResponse,
  ): Promise<void> {
    applySecurityHeaders(response);

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

    const ip = requestIp(request) ?? "unknown";

    let limit: RateLimitResult;
    try {
      limit = await checkRateLimit(ip);
    } catch (error) {
      logEvent("error", "contact.rate_limit.failed", {
        error: error instanceof Error ? error.name : "UnknownError",
      });
      sendJson(response, 503, { error: "The contact service is temporarily unavailable." });
      return;
    }
    if (!limit.success) {
      const retryAfter = Math.max(1, Math.ceil((limit.reset - Date.now()) / 1000));
      response.setHeader("Retry-After", String(retryAfter));
      sendJson(response, 429, { error: "Too many inquiries. Please try again later." });
      return;
    }

    const body = parseBody(request);
    if (body === undefined) {
      sendJson(response, 400, { error: "Submit a valid inquiry under 12 KB." });
      return;
    }
    const result = validateContactPayload(body);
    if (!result.ok) {
      sendJson(response, 400, { error: result.error });
      return;
    }
    if (result.honeypotFilled) {
      sendJson(response, 400, { error: "Check the inquiry details and try again." });
      return;
    }

    if (!sendEmail) {
      sendJson(response, 200, { notification: "disabled" });
      return;
    }

    try {
      const accepted = await sendEmail(result.value);
      if (!accepted) {
        recordEmailDelivery(process.env.SMTP_PROVIDER ?? "custom", "failure");
        logEvent("error", "contact.email_delivery.failed", {
          error: "ProviderRejected",
        });
      } else {
        recordEmailDelivery(process.env.SMTP_PROVIDER ?? "custom", "success");
        if (enableAutoReply && sendAutoReply) {
          try {
            const autoReplyAccepted = await sendAutoReply(result.value);
            if (!autoReplyAccepted) {
              logEvent("warn", "contact.auto_reply.failed", {
                error: "ProviderRejected",
              });
            }
          } catch (error) {
            logEvent("warn", "contact.auto_reply.failed", {
              error: error instanceof Error ? error.name : "UnknownError",
            });
          }
        }
      }
    } catch (error) {
      recordEmailDelivery(process.env.SMTP_PROVIDER ?? "custom", "failure");
      logEvent("error", "contact.email_delivery.failed", {
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }

    sendJson(response, 200, { ok: true });
  };
}

function requiredEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  errors: string[],
): string {
  const value = env[name]?.trim();
  if (!value) {
    errors.push(name);
    return "";
  }
  return value;
}

function readRuntimeConfig(env: NodeJS.ProcessEnv) {
  const errors: string[] = [];
  const isConfigured = (value: string | undefined) =>
    Boolean(value?.trim() &&
      !/replace(?:[-_ ]?with)?|example\.com|\.example\b/i.test(value));
  const provider = (env.SMTP_PROVIDER?.trim() || "custom").toLowerCase();
  const defaultSmtpHosts: Record<string, string> = {
    microsoft365: "smtp.office365.com",
    "google-workspace": "smtp.gmail.com",
    zoho: "smtp.zoho.com",
  };
  const smtpHost = env.SMTP_HOST?.trim();
  const smtpEnabled = isConfigured(env.SMTP_USER) &&
    isConfigured(env.SMTP_PASSWORD) &&
    (smtpHost ? isConfigured(smtpHost) : Boolean(defaultSmtpHosts[provider]));
  if (smtpEnabled) {
    try {
      resolveSmtpSettings(env);
    } catch {
      errors.push("SMTP_PROVIDER/SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD");
    }
  }
  const recipient = requiredEnv(env, "CONTACT_TO_EMAIL", errors);
  const sender = requiredEnv(env, "CONTACT_FROM_EMAIL", errors);
  const redisUrl = env.UPSTASH_REDIS_REST_URL?.trim();
  const redisToken = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const redisEnabled = isConfigured(redisUrl) && isConfigured(redisToken);
  if (recipient && !isValidEmail(recipient)) errors.push("CONTACT_TO_EMAIL");
  if (sender && !isValidEmail(sender)) errors.push("CONTACT_FROM_EMAIL");
  if (redisEnabled && redisUrl) {
    try {
      const url = new URL(redisUrl);
      if (url.protocol !== "https:" || url.username || url.password) {
        errors.push("UPSTASH_REDIS_REST_URL");
      }
    } catch {
      errors.push("UPSTASH_REDIS_REST_URL");
    }
  }

  if (errors.length > 0) {
    return { ok: false as const, errors };
  }
  return {
    ok: true as const,
    smtpEnabled,
    enableAutoReply: isAutoReplyEnabled(env),
    recipient,
    sender,
    redisEnabled,
    redisUrl,
    redisToken,
  };
}

export default async function handler(
  request: ApiRequest,
  response: ApiResponse,
): Promise<void> {
  const config = readRuntimeConfig(process.env);
  if (!config.ok) {
    applySecurityHeaders(response);
    console.error("Contact service configuration is incomplete or invalid:", config.errors.join(", "));
    sendJson(response, 503, { error: "The contact service is temporarily unavailable." });
    return;
  }

  const limiter = config.redisEnabled
    ? new Ratelimit({
        redis: new Redis({ url: config.redisUrl!, token: config.redisToken! }),
        limiter: Ratelimit.slidingWindow(5, "15 m"),
        prefix: "giemens:contact",
      })
    : undefined;
  const emailService = config.smtpEnabled
    ? new EmailService(createEmailProvider(process.env))
    : undefined;
  if (!emailService && !loggedSmtpDisabled) {
    console.warn("SMTP not configured. Contact notifications disabled.");
    loggedSmtpDisabled = true;
  }
  if (!limiter && !loggedRedisDisabled) {
    console.warn("Redis integration disabled. Contact rate limiting is per instance.");
    loggedRedisDisabled = true;
  }

  const contactHandler = createContactHandler({
    enableAutoReply: config.enableAutoReply,
    checkRateLimit: async (ip) => {
      if (!limiter) return fallbackRateLimit(ip);
      const result = await limiter.limit(ip);
      return { success: result.success, reset: result.reset };
    },
    ...(emailService
      ? {
          sendEmail: async (inquiry: ContactInquiry) => {
            const email = buildContactNotificationEmail(inquiry);
            await emailService.send({
              from: config.sender,
              to: config.recipient,
              replyTo: inquiry.email,
              ...email,
            });
            return true;
          },
          ...(config.enableAutoReply
            ? {
                sendAutoReply: async (inquiry: ContactInquiry) => {
                  const email = buildContactAutoReplyEmail(inquiry);
                  await emailService.send({
                    from: config.sender,
                    to: inquiry.email,
                    replyTo: config.recipient,
                    ...email,
                  });
                  return true;
                },
              }
            : {}),
        }
      : {}),
  });

  await contactHandler(request, response);
}

export function isAutoReplyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENABLE_AUTO_REPLY?.trim().toLowerCase() === "true";
}
