const placeholderPattern = /replace(?:[-_ ]?with)?|example\.com|\.example\b/i;
const required = [
  "DATABASE_URL",
  "AUTH_RATE_LIMIT_SECRET",
  "CONTACT_TO_EMAIL",
  "CONTACT_FROM_EMAIL",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(`Missing required runtime environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
const placeholderVariables = required.filter((name) =>
  placeholderPattern.test(process.env[name].trim()),
);
if (placeholderVariables.length > 0) {
  console.error(`Replace placeholder runtime values before startup: ${placeholderVariables.join(", ")}`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL.trim();
let parsedDatabaseUrl;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
  if (
    !["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol) ||
    !parsedDatabaseUrl.hostname ||
    !parsedDatabaseUrl.pathname.slice(1) ||
    !parsedDatabaseUrl.username ||
    !parsedDatabaseUrl.password ||
    parsedDatabaseUrl.searchParams.get("schema") !== "giemens_crm"
  ) {
    throw new Error();
  }
} catch {
  console.error("DATABASE_URL must target PostgreSQL database/schema giemens/giemens_crm and include credentials.");
  process.exit(1);
}
const databaseHost = parsedDatabaseUrl.hostname.replace(/^\[|\]$/g, "");
const isLoopbackDatabase = ["localhost", "127.0.0.1", "::1"].includes(databaseHost);
const databaseSslMode =
  parsedDatabaseUrl.searchParams.get("sslmode") ??
  process.env.PGSSLMODE ??
  (isLoopbackDatabase ? "prefer" : "verify-full");
if (!isLoopbackDatabase && ["disable", "allow", "prefer"].includes(databaseSslMode)) {
  console.error("Remote DATABASE_URL connections must use TLS (sslmode=require or verify-full).");
  process.exit(1);
}

if (Buffer.byteLength(process.env.AUTH_RATE_LIMIT_SECRET.trim(), "utf8") < 32) {
  console.error("AUTH_RATE_LIMIT_SECRET must contain at least 32 bytes.");
  process.exit(1);
}
if (
  process.env.METRICS_AUTH_TOKEN?.trim() &&
  Buffer.byteLength(process.env.METRICS_AUTH_TOKEN.trim(), "utf8") < 32
) {
  console.error("METRICS_AUTH_TOKEN must contain at least 32 bytes when configured.");
  process.exit(1);
}

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()) {
  try {
    const url = new URL(process.env.OTEL_EXPORTER_OTLP_ENDPOINT.trim());
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
  } catch {
    console.error("OTEL_EXPORTER_OTLP_ENDPOINT must be an HTTP(S) URL without embedded credentials.");
    process.exit(1);
  }
}

function isConfigured(name) {
  return Boolean(process.env[name]?.trim());
}

function isOptionalConfigured(name) {
  return isConfigured(name) && !placeholderPattern.test(process.env[name]);
}

function isSmtpConfigured() {
  const provider = (process.env.SMTP_PROVIDER?.trim() || "custom").toLowerCase();
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
  const provider = (process.env.SMTP_PROVIDER?.trim() || "custom").toLowerCase();
  const defaults = {
    microsoft365: "smtp.office365.com",
    "google-workspace": "smtp.gmail.com",
    zoho: "smtp.zoho.com",
  };
  if (!["custom", "microsoft365", "google-workspace", "zoho"].includes(provider)) {
    console.error("SMTP_PROVIDER must be custom, microsoft365, google-workspace or zoho.");
    process.exit(1);
  }
  const smtpHost =
    (isOptionalConfigured("SMTP_HOST") && process.env.SMTP_HOST.trim()) ||
    defaults[provider];
  if (!smtpHost || /[\s\r\n]/.test(smtpHost) || placeholderPattern.test(smtpHost)) {
    console.error("SMTP_HOST is required and must be valid for the selected SMTP_PROVIDER.");
    process.exit(1);
  }
  const smtpPort = process.env.SMTP_PORT?.trim();
  if (
    smtpPort &&
    (!/^\d+$/.test(smtpPort) || Number(smtpPort) < 1 || Number(smtpPort) > 65535)
  ) {
    console.error("SMTP_PORT must be an integer between 1 and 65535.");
    process.exit(1);
  }
}

function validateRedis() {
  if (!isOptionalConfigured("UPSTASH_REDIS_REST_URL") ||
      !isOptionalConfigured("UPSTASH_REDIS_REST_TOKEN")) return;
  try {
    const url = new URL(process.env.UPSTASH_REDIS_REST_URL.trim());
    if (url.protocol !== "https:" || url.username || url.password) throw new Error();
  } catch {
    console.error("UPSTASH_REDIS_REST_URL must be a valid HTTPS URL.");
    process.exit(1);
  }
}

function validateClamAv() {
  if (!isOptionalConfigured("CLAMAV_HOST")) return;
  if (/[\s\r\n]/.test(process.env.CLAMAV_HOST.trim())) {
    console.error("CLAMAV_HOST must be a hostname without whitespace.");
    process.exit(1);
  }
  const clamavPort = process.env.CLAMAV_PORT?.trim();
  if (
    clamavPort &&
    (!/^\d+$/.test(clamavPort) || Number(clamavPort) < 1 || Number(clamavPort) > 65535)
  ) {
    console.error("CLAMAV_PORT must be an integer between 1 and 65535.");
    process.exit(1);
  }
}

function validateBlobStorage() {
  if (!isOptionalConfigured("AZURE_STORAGE_ACCOUNT_URL") ||
      !isOptionalConfigured("AZURE_STORAGE_CONTAINER")) return;
  try {
    const url = new URL(process.env.AZURE_STORAGE_ACCOUNT_URL.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error();
    }
  } catch {
    console.error("AZURE_STORAGE_ACCOUNT_URL must be an HTTPS origin.");
    process.exit(1);
  }
  if (
    !/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(
      process.env.AZURE_STORAGE_CONTAINER.trim(),
    )
  ) {
    console.error("AZURE_STORAGE_CONTAINER is invalid.");
    process.exit(1);
  }
}

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
for (const name of ["CONTACT_TO_EMAIL", "CONTACT_FROM_EMAIL"]) {
  if (!emailPattern.test(process.env[name].trim())) {
    console.error(`${name} must be a valid email address.`);
    process.exit(1);
  }
}

const port = process.env.PORT?.trim();
if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)) {
  console.error("PORT must be an integer between 1 and 65535.");
  process.exit(1);
}

const proxyHops = process.env.TRUST_PROXY_HOPS?.trim();
if (
  proxyHops &&
  (!/^\d+$/.test(proxyHops) || Number(proxyHops) < 0 || Number(proxyHops) > 10)
) {
  console.error("TRUST_PROXY_HOPS must be an integer between 0 and 10.");
  process.exit(1);
}

validateSmtp();
validateRedis();
validateClamAv();
validateBlobStorage();
warnDisabledIntegrations();
console.info("Runtime environment validation passed.");
