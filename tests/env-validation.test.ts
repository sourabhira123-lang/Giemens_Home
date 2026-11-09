import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

const validateBuildPath = resolve("scripts/validate-env.mjs");
const validateRuntimePath = resolve("scripts/validate-runtime-env.mjs");
const disabledIntegrations = [
  "SMTP not configured. Contact notifications disabled.",
  "Redis integration disabled",
  "ClamAV integration disabled",
  "Blob Storage integration disabled",
];

function runScript(
  script: string,
  environment: NodeJS.ProcessEnv,
) {
  return spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: environment,
  });
}

function noOptionalIntegrations(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    SMTP_HOST: "",
    SMTP_PORT: "",
    UPSTASH_REDIS_REST_URL: "",
    UPSTASH_REDIS_REST_TOKEN: "",
    CLAMAV_HOST: "",
    CLAMAV_PORT: "",
    AZURE_STORAGE_ACCOUNT_URL: "",
    AZURE_STORAGE_CONTAINER: "",
  };
}

test("Vercel production build accepts missing optional integrations", () => {
  const result = runScript(validateBuildPath, {
    ...noOptionalIntegrations(),
    VERCEL: "1",
    VERCEL_ENV: "production",
    VITE_SITE_URL: "https://giemens.com",
    VITE_JURIVANA_URL: "https://jurivana.giemens.com",
    CONTACT_FROM_EMAIL: "website@giemens.com",
    CONTACT_TO_EMAIL: "contact@giemens.com",
  });

  assert.equal(result.status, 0, result.stderr);
  for (const warning of disabledIntegrations) {
    assert.match(result.stderr, new RegExp(warning));
  }
  assert.match(result.stdout, /Build environment validation passed/);
});

test("incomplete optional integration settings disable those integrations without failing", () => {
  const result = runScript(validateBuildPath, {
    ...noOptionalIntegrations(),
    VERCEL: "1",
    VERCEL_ENV: "production",
    VITE_SITE_URL: "https://giemens.com",
    VITE_JURIVANA_URL: "https://jurivana.giemens.com",
    CONTACT_FROM_EMAIL: "website@giemens.com",
    CONTACT_TO_EMAIL: "contact@giemens.com",
    SMTP_USER: "smtp-user",
    UPSTASH_REDIS_REST_URL: "https://redis.test",
    AZURE_STORAGE_ACCOUNT_URL: "https://storage.test",
  });

  assert.equal(result.status, 0, result.stderr);
  for (const warning of disabledIntegrations) {
    assert.match(result.stderr, new RegExp(warning));
  }
});

test("Vercel production build still requires public origins and contact addresses", () => {
  const result = runScript(validateBuildPath, {
    ...noOptionalIntegrations(),
    VERCEL: "1",
    VERCEL_ENV: "production",
    VITE_SITE_URL: "",
    VITE_JURIVANA_URL: "https://jurivana.giemens.com",
    CONTACT_FROM_EMAIL: "website@giemens.com",
    CONTACT_TO_EMAIL: "contact@giemens.com",
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /VITE_SITE_URL is required/);
});

test("runtime validation accepts disabled optional integrations", () => {
  const result = runScript(validateRuntimePath, {
    ...noOptionalIntegrations(),
    DATABASE_URL:
      "postgresql://app:secret@127.0.0.1:5432/giemens?schema=giemens_crm",
    AUTH_RATE_LIMIT_SECRET: "a".repeat(48),
    CONTACT_FROM_EMAIL: "website@giemens.com",
    CONTACT_TO_EMAIL: "contact@giemens.com",
  });

  assert.equal(result.status, 0, result.stderr);
  for (const warning of disabledIntegrations) {
    assert.match(result.stderr, new RegExp(warning));
  }
  assert.match(result.stdout, /Runtime environment validation passed/);
});
