const required = [
  "DATABASE_URL",
  "AUTH_RATE_LIMIT_SECRET",
  "SMTP_HOST",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "CONTACT_TO_EMAIL",
  "CONTACT_FROM_EMAIL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
];
const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  console.error(`Missing required runtime environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL.trim();
try {
  const url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
} catch {
  console.error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  process.exit(1);
}

if (Buffer.byteLength(process.env.AUTH_RATE_LIMIT_SECRET.trim(), "utf8") < 32) {
  console.error("AUTH_RATE_LIMIT_SECRET must contain at least 32 bytes.");
  process.exit(1);
}

if (/[\s\r\n]/.test(process.env.SMTP_HOST.trim())) {
  console.error("SMTP_HOST must be a hostname without whitespace.");
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
