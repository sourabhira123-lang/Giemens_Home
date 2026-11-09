import { readBuildEnv, validateSiteUrl } from "./env-utils.mjs";

const env = await readBuildEnv();
const isVercelProduction =
  env.VERCEL === "1" && env.VERCEL_ENV === "production";
const placeholderPattern = /replace(?:[-_ ]?with)?|example\.com|\.example\b/i;

function isConfigured(name) {
  return Boolean(env[name]?.trim());
}

function isOptionalConfigured(name) {
  return isConfigured(name) && !placeholderPattern.test(env[name]);
}

function isSmtpConfigured() {
  const provider = (env.SMTP_PROVIDER?.trim() || "custom").toLowerCase();
  const defaults = {
    microsoft365: "smtp.office365.com",
    "google-workspace": "smtp.gmail.com",
    zoho: "smtp.zoho.com",
  };
  const configuredHost = isOptionalConfigured("SMTP_HOST");
  return isOptionalConfigured("SMTP_USER") &&
    isOptionalConfigured("SMTP_PASSWORD") &&
    (configuredHost || Boolean(defaults[provider])) &&
    (!isConfigured("SMTP_HOST") || configuredHost);
}

function warnDisabledIntegrations() {
  if (!isSmtpConfigured()) {
    console.warn("SMTP not configured. Contact notifications disabled.");
  }
  if (!isOptionalConfigured("UPSTASH_REDIS_REST_URL") ||
      !isOptionalConfigured("UPSTASH_REDIS_REST_TOKEN")) {
    console.warn("Redis integration disabled");
  }
  if (!isOptionalConfigured("CLAMAV_HOST")) {
    console.warn("ClamAV integration disabled");
  }
  if (!isOptionalConfigured("AZURE_STORAGE_ACCOUNT_URL") ||
      !isOptionalConfigured("AZURE_STORAGE_CONTAINER")) {
    console.warn("Blob Storage integration disabled");
  }
}

function validateSmtp() {
  if (!isSmtpConfigured()) return;

  const provider = (env.SMTP_PROVIDER?.trim() || "custom").toLowerCase();
  const defaults = {
    microsoft365: "smtp.office365.com",
    "google-workspace": "smtp.gmail.com",
    zoho: "smtp.zoho.com",
  };
  if (!["custom", "microsoft365", "google-workspace", "zoho"].includes(provider)) {
    throw new Error("SMTP_PROVIDER must be custom, microsoft365, google-workspace or zoho.");
  }
  const smtpHost =
    (isOptionalConfigured("SMTP_HOST") && env.SMTP_HOST.trim()) ||
    defaults[provider];
  if (!smtpHost || /[\s\r\n]/.test(smtpHost)) {
    throw new Error("SMTP_HOST is required for the selected SMTP_PROVIDER.");
  }
  if (placeholderPattern.test(smtpHost)) {
    throw new Error("Replace the SMTP_HOST example value before enabling SMTP.");
  }
  if (
    env.SMTP_PORT?.trim() &&
    (!/^\d+$/.test(env.SMTP_PORT.trim()) ||
      Number(env.SMTP_PORT) < 1 ||
      Number(env.SMTP_PORT) > 65535)
  ) {
    throw new Error("SMTP_PORT must be an integer between 1 and 65535.");
  }
}

function validateRedis() {
  if (!isOptionalConfigured("UPSTASH_REDIS_REST_URL") ||
      !isOptionalConfigured("UPSTASH_REDIS_REST_TOKEN")) return;
  try {
    const url = new URL(env.UPSTASH_REDIS_REST_URL.trim());
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
  } catch {
    throw new Error("UPSTASH_REDIS_REST_URL must be a valid HTTPS URL.");
  }
}

function validateClamAv() {
  if (!isOptionalConfigured("CLAMAV_HOST")) return;
  if (/[\s\r\n]/.test(env.CLAMAV_HOST.trim())) {
    throw new Error("CLAMAV_HOST must be a hostname without whitespace.");
  }
  if (
    env.CLAMAV_PORT?.trim() &&
    (!/^\d+$/.test(env.CLAMAV_PORT.trim()) ||
      Number(env.CLAMAV_PORT) < 1 ||
      Number(env.CLAMAV_PORT) > 65535)
  ) {
    throw new Error("CLAMAV_PORT must be an integer between 1 and 65535.");
  }
}

function validateBlobStorage() {
  if (!isOptionalConfigured("AZURE_STORAGE_ACCOUNT_URL") ||
      !isOptionalConfigured("AZURE_STORAGE_CONTAINER")) return;
  try {
    const url = new URL(env.AZURE_STORAGE_ACCOUNT_URL.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
  } catch {
    throw new Error("AZURE_STORAGE_ACCOUNT_URL must be an HTTPS origin.");
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(env.AZURE_STORAGE_CONTAINER.trim())) {
    throw new Error("AZURE_STORAGE_CONTAINER is invalid.");
  }
}

if (isVercelProduction && !env.VITE_SITE_URL?.trim()) {
  console.error("VITE_SITE_URL is required for a Vercel production build.");
  process.exit(1);
}
if (isVercelProduction && !env.VITE_JURIVANA_URL?.trim()) {
  console.error("VITE_JURIVANA_URL is required for a Vercel production build.");
  process.exit(1);
}
if (
  isVercelProduction &&
  placeholderPattern.test(env.VITE_SITE_URL)
) {
  console.error("Replace the VITE_SITE_URL example value with the production HTTPS origin.");
  process.exit(1);
}
if (isVercelProduction) {
  const requiredVariables = ["CONTACT_TO_EMAIL", "CONTACT_FROM_EMAIL"];
  const missingVariables = requiredVariables.filter((name) => !isConfigured(name));
  if (missingVariables.length > 0) {
    console.error(
      `Missing required Vercel Production environment variables: ${missingVariables.join(", ")}`,
    );
    process.exit(1);
  }
  const placeholderVariables = requiredVariables.filter((name) =>
    placeholderPattern.test(env[name]),
  );
  if (placeholderVariables.length > 0) {
    console.error(
      `Replace placeholder Vercel Production environment values: ${placeholderVariables.join(", ")}`,
    );
    process.exit(1);
  }
  const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  for (const name of requiredVariables) {
    if (!emailPattern.test(env[name].trim())) {
      console.error(`${name} must be a valid email address.`);
      process.exit(1);
    }
  }
}

if (env.VITE_SITE_URL?.trim()) {
  try {
    validateSiteUrl(env.VITE_SITE_URL.trim());
  } catch (error) {
    console.error(error instanceof Error ? error.message : "VITE_SITE_URL is invalid.");
    process.exit(1);
  }
}

if (env.VITE_JURIVANA_URL?.trim()) {
  try {
    const url = new URL(env.VITE_JURIVANA_URL.trim());
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      placeholderPattern.test(url.hostname)
    ) {
      throw new Error();
    }
  } catch {
    console.error("VITE_JURIVANA_URL must be a non-placeholder HTTPS origin without credentials or a path.");
    process.exit(1);
  }
}

if (
  env.VITE_CONTACT_ENDPOINT?.trim() &&
  env.VITE_CONTACT_ENDPOINT.trim() !== "/api/contact"
) {
  console.error("VITE_CONTACT_ENDPOINT must be the same-origin path /api/contact.");
  process.exit(1);
}

if (isVercelProduction) {
  if (
    env.METRICS_AUTH_TOKEN?.trim() &&
    Buffer.byteLength(env.METRICS_AUTH_TOKEN.trim(), "utf8") < 32
  ) {
    console.error("METRICS_AUTH_TOKEN must contain at least 32 bytes when configured.");
    process.exit(1);
  }
}

try {
  validateSmtp();
  validateRedis();
  validateClamAv();
  validateBlobStorage();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Optional integration configuration is invalid.");
  process.exit(1);
}

warnDisabledIntegrations();
console.info("Build environment validation passed.");
