import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import contactFunction, {
  createContactHandler,
  isAutoReplyEnabled,
} from "../api/contact.ts";
import {
  validateContactPayload,
  type ContactInquiry,
} from "../server/contact-validation.ts";
import {
  buildContactAutoReplyEmail,
  buildContactNotificationEmail,
} from "../server/email-templates.ts";
import {
  detectDialCodeFromTimezone,
  getDefaultDialCode,
} from "../src/utils/phoneCountryCode.ts";

const validPayload = {
  fullName: "Example Sender",
  email: "sender@example.com",
  phone: "+14155552671",
  organization: "Example Organization",
  category: "General Inquiry",
  subject: "A question",
  message: "I would like to learn more about your services.",
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
    body: validPayload,
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

function makeHandler(options: {
  allowed?: boolean;
  sendEmail?: (inquiry: ContactInquiry) => Promise<boolean>;
  sendAutoReply?: (inquiry: ContactInquiry) => Promise<boolean>;
  enableAutoReply?: boolean;
  checkRateLimit?: (ip: string) => Promise<{ success: boolean; reset: number }>;
} = {}) {
  const sent: ContactInquiry[] = [];
  const handler = createContactHandler({
    checkRateLimit:
      options.checkRateLimit ??
      (async () => ({
        success: options.allowed ?? true,
        reset: Date.now() + 60_000,
      })),
    sendEmail:
      options.sendEmail ??
      (async (inquiry) => {
        sent.push(inquiry);
        return true;
      }),
      ...(options.sendAutoReply ? { sendAutoReply: options.sendAutoReply } : {}),
      enableAutoReply: options.enableAutoReply,
  });
  return { handler, sent };
}

test("validates and normalizes contact inquiries", () => {
  const result = validateContactPayload({
    ...validPayload,
    phone: "+1 (415) 555-2671",
    fullName: "  Example Sender  ",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.fullName, "Example Sender");
    assert.equal(result.value.phone, "+14155552671");
  }
});

test("builds contact notification and customer acknowledgement templates", () => {
  const inquiry: ContactInquiry = {
    ...validPayload,
    category: "General Inquiry",
    source: "website_contact_form",
  };
  const submittedAt = new Date("2026-11-14T10:30:00.000Z");
  const notification = buildContactNotificationEmail(inquiry, { submittedAt });
  const autoReply = buildContactAutoReplyEmail(inquiry, submittedAt);

  assert.equal(notification.subject, "[GIEMENS] New Contact Inquiry");
  for (const detail of [
    "Name: Example Sender",
    "Email: sender@example.com",
    "Phone: +14155552671",
    "Organization: Example Organization",
    "Category: General Inquiry",
    "Subject: A question",
    "I would like to learn more about your services.",
    "Date: 2026-11-14T10:30:00.000Z",
    "Source: website_contact_form",
  ]) {
    assert.ok(notification.text.includes(detail));
  }
  assert.equal(autoReply.subject, "Thank you for contacting GIEMENS");
  assert.ok(autoReply.text.includes("Hello Example Sender,"));
  assert.ok(autoReply.text.includes("Submitted: 2026-11-14T10:30:00.000Z"));
  assert.ok(autoReply.text.includes("info@giemens.com"));
  assert.ok(autoReply.text.includes("https://giemens.com"));
});

test("detects dial codes from timezone with an India fallback", () => {
  assert.equal(detectDialCodeFromTimezone("Asia/Kolkata"), "+91");
  assert.equal(detectDialCodeFromTimezone("Asia/Dubai"), "+971");
  assert.equal(detectDialCodeFromTimezone("Asia/Singapore"), "+65");
  assert.equal(detectDialCodeFromTimezone("Europe/London"), "+44");
  assert.equal(detectDialCodeFromTimezone("America/New_York"), "+1");
  assert.equal(detectDialCodeFromTimezone("America/Chicago"), "+1");
  assert.equal(detectDialCodeFromTimezone("America/Los_Angeles"), "+1");
  assert.equal(detectDialCodeFromTimezone("Australia/Sydney"), "+61");
  assert.equal(detectDialCodeFromTimezone("Pacific/Honolulu"), undefined);
  assert.equal(getDefaultDialCode("Pacific/Honolulu"), "+91");
});

test("keeps auto reply disabled by default and enables it only for true", () => {
  assert.equal(isAutoReplyEnabled({}), false);
  assert.equal(isAutoReplyEnabled({ ENABLE_AUTO_REPLY: "false" }), false);
  assert.equal(isAutoReplyEnabled({ ENABLE_AUTO_REPLY: "true" }), true);
  assert.equal(isAutoReplyEnabled({ ENABLE_AUTO_REPLY: "1" }), false);
});

test("contact API reports disabled notifications when SMTP and Redis are disabled", async () => {
  const names = [
    "CONTACT_TO_EMAIL",
    "CONTACT_FROM_EMAIL",
    "SMTP_PROVIDER",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_HOST",
    "SMTP_PORT",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ] as const;
  const previous = new Map(names.map((name) => [name, process.env[name]]));
  process.env.CONTACT_TO_EMAIL = "personal@example.net";
  process.env.CONTACT_FROM_EMAIL = "personal@example.net";
  for (const name of names.slice(2)) delete process.env[name];

  try {
    const output = makeResponse();
    await contactFunction(makeRequest(), output.response);
    assert.equal(output.response.statusCode, 200);
    assert.deepEqual(output.body, { notification: "disabled" });
  } finally {
    for (const name of names) {
      const value = previous.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("rejects malformed, oversized, and unsupported inquiry fields", () => {
  for (const body of [
    null,
    [],
    { ...validPayload, email: "not-an-email" },
    { ...validPayload, subject: "Injected\r\nBcc: other@example.com" },
    { ...validPayload, phone: "123" },
    { ...validPayload, message: "short" },
    { ...validPayload, fullName: "x".repeat(121) },
    { ...validPayload, organization: 42 },
    { ...validPayload, category: "Unknown category" },
  ]) {
    assert.equal(validateContactPayload(body).ok, false);
  }
});

test("sends a valid inquiry and returns success only after acceptance", async () => {
  const { handler, sent } = makeHandler();
  const output = makeResponse();
  await handler(makeRequest(), output.response);
  assert.equal(output.response.statusCode, 200);
  assert.deepEqual(output.body, { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].email, validPayload.email);
});

test("accepts an inquiry when the email provider rejects the message", async () => {
  const { handler, sent } = makeHandler({
    sendEmail: async () => false,
  });
  const output = makeResponse();
  await handler(makeRequest(), output.response);
  assert.equal(output.response.statusCode, 200);
  assert.deepEqual(output.body, { ok: true });
  assert.equal(sent.length, 0);
});

test("accepts an inquiry when SMTP delivery throws", async () => {
  const { handler } = makeHandler({
    sendEmail: async () => {
      throw new Error("SMTP unavailable");
    },
  });
  const output = makeResponse();
  await handler(makeRequest(), output.response);
  assert.equal(output.response.statusCode, 200);
  assert.deepEqual(output.body, { ok: true });
});

test("attempts auto reply only after notification when enabled", async () => {
  const attempts: string[] = [];
  const { handler } = makeHandler({
    enableAutoReply: true,
    sendEmail: async () => {
      attempts.push("notification");
      return true;
    },
    sendAutoReply: async () => {
      attempts.push("auto-reply");
      return true;
    },
  });
  const output = makeResponse();
  await handler(makeRequest(), output.response);
  assert.equal(output.response.statusCode, 200);
  assert.deepEqual(attempts, ["notification", "auto-reply"]);
});

test("does not attempt auto reply when disabled or notification fails", async () => {
  let autoReplyAttempted = false;
  const disabled = makeHandler({
    enableAutoReply: false,
    sendAutoReply: async () => {
      autoReplyAttempted = true;
      return true;
    },
  });
  const disabledResponse = makeResponse();
  await disabled.handler(makeRequest(), disabledResponse.response);
  assert.equal(autoReplyAttempted, false);

  const rejected = makeHandler({
    enableAutoReply: true,
    sendEmail: async () => false,
    sendAutoReply: async () => {
      autoReplyAttempted = true;
      return true;
    },
  });
  const rejectedResponse = makeResponse();
  await rejected.handler(makeRequest(), rejectedResponse.response);
  assert.equal(rejectedResponse.response.statusCode, 200);
  assert.equal(autoReplyAttempted, false);

  const unavailableMailer = createContactHandler({
    checkRateLimit: async () => ({ success: true, reset: Date.now() + 60_000 }),
    enableAutoReply: true,
    sendAutoReply: async () => {
      autoReplyAttempted = true;
      return true;
    },
  });
  const unavailableResponse = makeResponse();
  await unavailableMailer(makeRequest(), unavailableResponse.response);
  assert.equal(unavailableResponse.response.statusCode, 200);
  assert.deepEqual(unavailableResponse.body, { notification: "disabled" });
  assert.equal(autoReplyAttempted, false);
});

test("auto reply failure logs without failing the contact submission", async () => {
  const { handler } = makeHandler({
    enableAutoReply: true,
    sendAutoReply: async () => {
      throw new Error("mail transport unavailable");
    },
  });
  const output = makeResponse();
  await handler(makeRequest(), output.response);
  assert.equal(output.response.statusCode, 200);
  assert.deepEqual(output.body, { ok: true });
});

test("rate limits requests before attempting email delivery", async () => {
  let emailAttempted = false;
  const { handler } = makeHandler({
    checkRateLimit: async () => ({ success: false, reset: Date.now() + 30_000 }),
    sendEmail: async () => {
      emailAttempted = true;
      return true;
    },
  });
  const output = makeResponse();
  await handler(makeRequest(), output.response);
  assert.equal(output.response.statusCode, 429);
  assert.equal(output.headers["retry-after"], "30");
  assert.equal(emailAttempted, false);
});

test("uses the Cloudflare client IP and rate limits requests with an unknown IP", async () => {
  const checkedIps: string[] = [];
  const { handler } = makeHandler({
    checkRateLimit: async (ip) => {
      checkedIps.push(ip);
      return { success: true, reset: Date.now() + 60_000 };
    },
  });
  const cloudflareResponse = makeResponse();
  const cloudflareRequest = makeRequest({
    headers: {
      host: "example.test",
      origin: "https://example.test",
      "content-type": "application/json",
      "cf-connecting-ip": "198.51.100.20",
    },
  });
  delete cloudflareRequest.ip;
  await handler(
    cloudflareRequest,
    cloudflareResponse.response,
  );

  const unknownRequest = makeRequest();
  delete unknownRequest.ip;
  const unknownResponse = makeResponse();
  await handler(unknownRequest, unknownResponse.response);

  assert.deepEqual(checkedIps, ["198.51.100.20", "unknown"]);
  assert.equal(unknownResponse.response.statusCode, 200);
});

test("rejects honeypot submissions without delivering email", async () => {
  const { handler, sent } = makeHandler();
  const output = makeResponse();
  await handler(
    makeRequest({ body: { ...validPayload, website: "spam" } }),
    output.response,
  );
  assert.equal(output.response.statusCode, 400);
  assert.equal(sent.length, 0);
});

test("rejects oversized payloads and unavailable rate-limit storage", async () => {
  const { handler, sent } = makeHandler();
  const oversized = makeResponse();
  await handler(
    makeRequest({
      headers: {
        host: "example.test",
        origin: "https://example.test",
        "content-type": "application/json",
        "content-length": "12001",
      },
    }),
    oversized.response,
  );
  assert.equal(oversized.response.statusCode, 413);

  const unavailable = makeHandler({
    checkRateLimit: async () => {
      throw new Error("storage unavailable");
    },
  });
  const unavailableResponse = makeResponse();
  await unavailable.handler(makeRequest(), unavailableResponse.response);
  assert.equal(unavailableResponse.response.statusCode, 503);
  assert.equal(sent.length, 0);
});

test("requires contact addresses even when SMTP and Redis are optional", async () => {
  const variableNames = [
    "SMTP_PROVIDER",
    "SMTP_HOST",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_PORT",
    "CONTACT_TO_EMAIL",
    "CONTACT_FROM_EMAIL",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ];
  const previous = new Map(
    variableNames.map((name) => [name, process.env[name]]),
  );
  try {
    for (const name of variableNames) delete process.env[name];
    const output = makeResponse();
    await contactFunction(makeRequest(), output.response);
    assert.equal(output.response.statusCode, 503);
    assert.equal(output.body.ok, undefined);
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("returns an explicit disabled-notification status when no email provider is configured", async () => {
  const handler = createContactHandler({
    checkRateLimit: async () => ({ success: true, reset: Date.now() + 60_000 }),
  });
  const output = makeResponse();
  await handler(makeRequest(), output.response);
  assert.equal(output.response.statusCode, 200);
  assert.deepEqual(output.body, { notification: "disabled" });
});

test("rejects cross-origin, non-JSON, and non-POST requests", async () => {
  const { handler, sent } = makeHandler();

  const crossOrigin = makeResponse();
  await handler(
    makeRequest({
      headers: {
        host: "example.test",
        origin: "https://untrusted.test",
        "content-type": "application/json",
      },
    }),
    crossOrigin.response,
  );
  assert.equal(crossOrigin.response.statusCode, 403);

  const wrongContentType = makeResponse();
  await handler(
    makeRequest({
      headers: {
        host: "example.test",
        origin: "https://example.test",
        "content-type": "text/plain",
      },
    }),
    wrongContentType.response,
  );
  assert.equal(wrongContentType.response.statusCode, 415);

  const wrongMethod = makeResponse();
  await handler(makeRequest({ method: "GET" }), wrongMethod.response);
  assert.equal(wrongMethod.response.statusCode, 405);
  assert.equal(wrongMethod.headers.allow, "POST");
  assert.equal(sent.length, 0);
});
