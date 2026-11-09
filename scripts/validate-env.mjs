import { readBuildEnv, validateSiteUrl } from "./env-utils.mjs";

const env = await readBuildEnv();
const isVercelProduction =
  env.VERCEL === "1" && env.VERCEL_ENV === "production";

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
  /replace(?:[-_ ]?with)?|example\.com|\.example\b/i.test(env.VITE_SITE_URL)
) {
  console.error("Replace the VITE_SITE_URL example value with the production HTTPS origin.");
  process.exit(1);
}
if (isVercelProduction && !env.VITE_CONTACT_ENDPOINT?.trim()) {
  console.error("VITE_CONTACT_ENDPOINT is required for a Vercel production build.");
  process.exit(1);
}
if (isVercelProduction) {
  const requiredServerVariables = [
    "DATABASE_URL",
    "AUTH_RATE_LIMIT_SECRET",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "CLAMAV_HOST",
    "CONTACT_TO_EMAIL",
    "CONTACT_FROM_EMAIL",
    "AZURE_STORAGE_ACCOUNT_URL",
    "AZURE_STORAGE_CONTAINER",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ];
  const missingVariables = requiredServerVariables.filter(
    (name) => !env[name]?.trim(),
  );
  if (missingVariables.length > 0) {
    console.error(
      `Missing required Vercel Production environment variables: ${missingVariables.join(", ")}`,
    );
    process.exit(1);
  }
  const placeholderVariables = requiredServerVariables.filter((name) =>
    /replace(?:[-_ ]?with)?|example\.com|\.example\b/i.test(env[name]),
  );
  if (placeholderVariables.length > 0) {
    console.error(
      `Replace placeholder Vercel Production environment values: ${placeholderVariables.join(", ")}`,
    );
    process.exit(1);
  }
  if (Buffer.byteLength(env.AUTH_RATE_LIMIT_SECRET.trim(), "utf8") < 32) {
    console.error("AUTH_RATE_LIMIT_SECRET must contain at least 32 characters.");
    process.exit(1);
  }
  if (
    env.METRICS_AUTH_TOKEN?.trim() &&
    Buffer.byteLength(env.METRICS_AUTH_TOKEN.trim(), "utf8") < 32
  ) {
    console.error("METRICS_AUTH_TOKEN must contain at least 32 bytes when configured.");
    process.exit(1);
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
      /replace(?:[-_ ]?with)?|example\.com|\.example\b/i.test(url.hostname)
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
  const provider = (env.SMTP_PROVIDER?.trim() || "custom").toLowerCase();
  const defaults = {
    microsoft365: "smtp.office365.com",
    "google-workspace": "smtp.gmail.com",
    zoho: "smtp.zoho.com",
  };
  if (!["custom", "microsoft365", "google-workspace", "zoho"].includes(provider)) {
    console.error("SMTP_PROVIDER must be custom, microsoft365, google-workspace or zoho.");
    process.exit(1);
  }
  const smtpHost = env.SMTP_HOST?.trim() || defaults[provider];
  if (!smtpHost || /[\s\r\n]/.test(smtpHost)) {
    console.error("SMTP_HOST is required for the selected SMTP_PROVIDER.");
    process.exit(1);
  }
  if (
    env.SMTP_PORT?.trim() &&
    (!/^\d+$/.test(env.SMTP_PORT.trim()) ||
      Number(env.SMTP_PORT) < 1 ||
      Number(env.SMTP_PORT) > 65535)
  ) {
    console.error("SMTP_PORT must be an integer between 1 and 65535.");
    process.exit(1);
  }
  const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
  for (const name of ["CONTACT_TO_EMAIL", "CONTACT_FROM_EMAIL"]) {
    if (!emailPattern.test(env[name].trim())) {
      console.error(`${name} must be a valid email address.`);
      process.exit(1);
    }
  }
  try {
    if (new URL(env.UPSTASH_REDIS_REST_URL.trim()).protocol !== "https:") {
      throw new Error();
    }
  } catch {
    console.error("UPSTASH_REDIS_REST_URL must be a valid HTTPS URL.");
    process.exit(1);
  }
}

console.info("Build environment validation passed.");
