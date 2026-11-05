import { PrismaClient } from "@prisma/client";

const expectedTables = [
  "roles",
  "users",
  "leads",
  "activities",
  "customers",
  "projects",
  "tasks",
  "sessions",
  "auth_rate_limits",
  "jurivana_requests",
  "request_comments",
  "documents",
  "request_documents",
  "audit_logs",
];
const prisma = new PrismaClient();

try {
  const rows = await prisma.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'giemens_crm'
      AND table_type = 'BASE TABLE'
  `;
  const existing = new Set(rows.map((row) => row.table_name));
  const missing = expectedTables.filter((name) => !existing.has(name));
  if (missing.length > 0) {
    console.error(`Missing tables in giemens_crm: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.info(`Verified ${expectedTables.length} tables in giemens_crm.`);
  }
} catch (error) {
  console.error(
    "Database table verification failed:",
    error instanceof Error ? error.name : "UnknownError",
  );
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
