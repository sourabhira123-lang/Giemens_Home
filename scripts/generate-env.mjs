import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";

const targets = [
  {
    file: ".env.development",
    siteUrl: "http://localhost:5173",
    databaseHost: "127.0.0.1",
  },
  {
    file: ".env.production",
    siteUrl: "https://www.giemens.com",
    databaseHost: "postgres.example.com",
  },
];

function randomSecret() {
  return randomBytes(32).toString("base64url");
}

for (const target of targets) {
  const contents = [
    `VITE_SITE_URL=${target.siteUrl}`,
    "VITE_JURIVANA_URL=https://jurivana.giemens.com",
    "VITE_CONTACT_ENDPOINT=/api/contact",
    `DATABASE_URL="postgresql://giemens_app:REPLACE_URL_ENCODED_PASSWORD@${target.databaseHost}:5432/giemens?schema=giemens_crm"`,
    "ADMIN_EMAIL=admin@giemens.local",
    "ADMIN_NAME=GIEMENS Local Admin",
    `ADMIN_PASSWORD=${randomSecret()}`,
    `AUTH_RATE_LIMIT_SECRET=${randomSecret()}`,
    `METRICS_AUTH_TOKEN=${randomSecret()}`,
    "OTEL_EXPORTER_OTLP_ENDPOINT=",
    "OTEL_EXPORTER_OTLP_HEADERS=",
    "SMTP_PROVIDER=custom",
    "SMTP_HOST=smtp.example.com",
    "SMTP_PORT=587",
    "SMTP_USER=REPLACE_WITH_SMTP_USERNAME",
    "SMTP_PASSWORD=REPLACE_WITH_SMTP_PASSWORD",
    "CONTACT_TO_EMAIL=admin@jurivana.example",
    "CONTACT_FROM_EMAIL=noreply@jurivana.example",
    "UPSTASH_REDIS_REST_URL=https://replace-with-upstash-endpoint.upstash.io",
    "UPSTASH_REDIS_REST_TOKEN=REPLACE_WITH_UPSTASH_REST_TOKEN",
    "AZURE_STORAGE_ACCOUNT_URL=https://replacewithstorage.blob.core.windows.net",
    "AZURE_STORAGE_CONTAINER=documents",
    "CLAMAV_HOST=clamav",
    "CLAMAV_PORT=3310",
    "DOCUMENT_PENDING_RETENTION_HOURS=24",
    "DOCUMENT_REJECTED_RETENTION_DAYS=30",
    "TRUST_PROXY_HOPS=0",
    "",
  ].join("\n");
  try {
    await writeFile(target.file, contents, { flag: "wx", mode: 0o600 });
    console.info(`Created ${target.file}; replace all REPLACE_* and example endpoint values.`);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    console.info(`Skipped existing ${target.file}; refusing to overwrite it.`);
  }
}
