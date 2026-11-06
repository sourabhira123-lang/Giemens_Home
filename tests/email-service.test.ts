import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EmailHealthCheck,
  EmailService,
  resolveSmtpSettings,
  type EmailProvider,
} from "../server/email-service.ts";

function provider(overrides: Partial<EmailProvider> = {}): EmailProvider {
  return {
    name: "custom",
    async send() {},
    async verify() {},
    ...overrides,
  };
}

test("resolves SMTP defaults for supported providers", () => {
  const settings = resolveSmtpSettings({
    SMTP_PROVIDER: "google-workspace",
    SMTP_USER: "mailer@example.com",
    SMTP_PASSWORD: "application-password",
  });
  assert.equal(settings.host, "smtp.gmail.com");
  assert.equal(settings.port, 587);
});

test("retries transient SMTP failures and stops after delivery succeeds", async () => {
  let attempts = 0;
  const service = new EmailService(provider({
    async send() {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error("temporary"), { code: "ETIMEDOUT" });
    },
  }));
  await service.send({
    from: "from@example.com",
    to: "to@example.com",
    subject: "Test",
    text: "Test body",
  });
  assert.equal(attempts, 2);
});

test("does not retry permanent SMTP failures and surfaces provider health errors", async () => {
  let attempts = 0;
  const providerWithError = provider({
    async send() {
      attempts += 1;
      throw Object.assign(new Error("authentication failed"), { code: "EAUTH" });
    },
    async verify() {
      throw new Error("provider unavailable");
    },
  });
  const service = new EmailService(providerWithError);
  await assert.rejects(
    service.send({ from: "a@example.com", to: "b@example.com", subject: "Test", text: "Test" }),
    /authentication failed/,
  );
  assert.equal(attempts, 1);
  await assert.rejects(new EmailHealthCheck(providerWithError).check(), /provider unavailable/);
});
