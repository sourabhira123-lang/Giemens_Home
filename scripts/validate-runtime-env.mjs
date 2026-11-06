const required = [
  "DATABASE_URL",
  "AUTH_RATE_LIMIT_SECRET",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "CONTACT_TO_EMAIL",
  "CONTACT_FROM_EMAIL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "AZURE_STORAGE_ACCOUNT_URL",
  "AZURE_STORAGE_CONTAINER",
  "CLAMAV_HOST",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(`Missing required runtime environment variables: ${missing.join(", ")}`);
  process.exit(1);
}
const placeholderVariables = required.filter((name) =>
  /replace(?:[-_ ]?with)?|example\.com|\.example\b/i.test(process.env[name].trim()),
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

const smtpProvider = (process.env.SMTP_PROVIDER?.trim() || "custom").toLowerCase();
if (!["custom", "microsoft365", "google-workspace", "zoho"].includes(smtpProvider)) {
  console.error("SMTP_PROVIDER must be custom, microsoft365, google-workspace or zoho.");
  process.exit(1);
}
const smtpDefaults = {
  microsoft365: "smtp.office365.com",
  "google-workspace": "smtp.gmail.com",
  zoho: "smtp.zoho.com",
};
const smtpHost = process.env.SMTP_HOST?.trim() || smtpDefaults[smtpProvider];
if (!smtpHost || /[\s\r\n]/.test(smtpHost)) {
  console.error("SMTP_HOST is required for the selected SMTP_PROVIDER.");
  process.exit(1);
}
if (/replace(?:[-_ ]?with)?|example\.com|\.example\b/i.test(smtpHost)) {
  console.error("Replace the SMTP_HOST example value before startup.");
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

const clamavHost = process.env.CLAMAV_HOST?.trim();
if (!clamavHost || /[\s\r\n]/.test(clamavHost)) {
  console.error("CLAMAV_HOST must be configured as a private service hostname.");
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

const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
for (const name of ["CONTACT_TO_EMAIL", "CONTACT_FROM_EMAIL"]) {
  if (!emailPattern.test(process.env[name].trim())) {
    console.error(`${name} must be a valid email address.`);
    process.exit(1);
  }
}

try {
  const url = new URL(process.env.UPSTASH_REDIS_REST_URL.trim());
  if (url.protocol !== "https:" || url.username || url.password) throw new Error();
} catch {
  console.error("UPSTASH_REDIS_REST_URL must be a valid HTTPS URL.");
  process.exit(1);
}

if (process.env.AZURE_STORAGE_ACCOUNT_URL?.trim()) {
  try {
    const url = new URL(process.env.AZURE_STORAGE_ACCOUNT_URL.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      throw new Error();
    }
  } catch {
    console.error("AZURE_STORAGE_ACCOUNT_URL must be an HTTPS origin.");
    process.exit(1);
  }
}

if (process.env.AZURE_STORAGE_CONTAINER?.trim() &&
  !/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(process.env.AZURE_STORAGE_CONTAINER.trim())) {
  console.error("AZURE_STORAGE_CONTAINER is invalid.");
  process.exit(1);
}
if (Boolean(process.env.AZURE_STORAGE_ACCOUNT_URL?.trim()) !==
  Boolean(process.env.AZURE_STORAGE_CONTAINER?.trim())) {
  console.error("Configure both AZURE_STORAGE_ACCOUNT_URL and AZURE_STORAGE_CONTAINER.");
  process.exit(1);
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

console.info("Runtime environment validation passed.");
