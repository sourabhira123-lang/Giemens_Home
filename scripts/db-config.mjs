import { readFile } from "node:fs/promises";
import { URL } from "node:url";

async function readDatabaseUrl(environmentFile) {
  if (process.env.DATABASE_URL?.trim()) return process.env.DATABASE_URL.trim();

  const contents = await readFile(environmentFile, "utf8");
  const line = contents
    .split(/\r?\n/)
    .find((entry) => /^\s*(?:export\s+)?DATABASE_URL\s*=/.test(entry));
  if (!line) throw new Error("DATABASE_URL is missing from the environment and .env.");

  let value = line.replace(/^\s*(?:export\s+)?DATABASE_URL\s*=\s*/, "").trim();
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  } else {
    value = value.replace(/\s+#.*$/, "").trim();
  }
  if (!value) throw new Error("DATABASE_URL is empty.");
  return value;
}

try {
  const connectionString = await readDatabaseUrl(process.argv[2]);
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must use PostgreSQL.");
  }
  if (url.searchParams.get("schema") !== "giemens_crm") {
    throw new Error("DATABASE_URL must target schema giemens_crm.");
  }
  if (!url.hostname || !url.pathname.slice(1) || !url.username) {
    throw new Error("DATABASE_URL must include a host, database, and username.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const isLoopback = ["localhost", "127.0.0.1", "::1"].includes(hostname);
  const sslMode =
    url.searchParams.get("sslmode") ??
    process.env.PGSSLMODE ??
    (isLoopback ? "prefer" : "verify-full");
  if (!isLoopback && ["disable", "allow", "prefer"].includes(sslMode)) {
    throw new Error("Remote database connections must use TLS; configure sslmode=require or verify-full.");
  }

  const values = [
    hostname,
    url.port || "5432",
    decodeURIComponent(url.pathname.slice(1)),
    decodeURIComponent(url.username),
    decodeURIComponent(url.password),
    sslMode,
    connectionString,
  ];
  process.stdout.write(`${values.join("\0")}\0`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not read the database configuration.");
  process.exitCode = 1;
}
