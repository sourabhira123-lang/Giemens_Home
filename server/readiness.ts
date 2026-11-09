import { Redis } from "@upstash/redis";
import { checkBlobStorageReadiness } from "./azure-blob-storage.ts";
import { checkClamAvReadiness } from "./clamav.ts";
import { createEmailProvider, EmailHealthCheck } from "./email-service.ts";
import { prisma } from "./prisma.ts";

export const requiredDependencies = [
  "database",
  "smtp",
  "blob-storage",
  "redis",
  "clamav",
] as const;

export type DependencyName = (typeof requiredDependencies)[number];
export type DependencyChecks = Record<DependencyName, () => Promise<unknown>>;
export type IntegrationStatus = "disabled" | "healthy" | "unhealthy";
export type IntegrationReadiness = {
  smtp: IntegrationStatus;
  redis: IntegrationStatus;
  clamav: IntegrationStatus;
  blobStorage: IntegrationStatus;
};

function isConfigured(value: string | undefined): boolean {
  return Boolean(
    value?.trim() &&
      !/replace(?:[-_ ]?with)?|example\.com|\.example\b/i.test(value),
  );
}

export function getIntegrationReadiness(
  env: NodeJS.ProcessEnv = process.env,
): IntegrationReadiness {
  const provider = (env.SMTP_PROVIDER?.trim() || "custom").toLowerCase();
  const defaultSmtpHosts: Record<string, string> = {
    microsoft365: "smtp.office365.com",
    "google-workspace": "smtp.gmail.com",
    zoho: "smtp.zoho.com",
  };
  const smtpHost = env.SMTP_HOST?.trim();
  return {
    smtp: isConfigured(env.SMTP_USER) &&
      isConfigured(env.SMTP_PASSWORD) &&
      (smtpHost ? isConfigured(smtpHost) : Boolean(defaultSmtpHosts[provider]))
      ? "healthy"
      : "disabled",
    redis: isConfigured(env.UPSTASH_REDIS_REST_URL) &&
      isConfigured(env.UPSTASH_REDIS_REST_TOKEN)
      ? "healthy"
      : "disabled",
    clamav: isConfigured(env.CLAMAV_HOST) ? "healthy" : "disabled",
    blobStorage: isConfigured(env.AZURE_STORAGE_ACCOUNT_URL) &&
      isConfigured(env.AZURE_STORAGE_CONTAINER)
      ? "healthy"
      : "disabled",
  };
}

export class DependencyReadinessError extends Error {
  readonly dependencies: DependencyName[];
  readonly integrations: IntegrationReadiness;

  constructor(
    dependencies: DependencyName[],
    integrations: IntegrationReadiness,
  ) {
    super(`Dependency readiness failed: ${dependencies.join(", ")}`);
    this.name = "DependencyReadinessError";
    this.dependencies = dependencies;
    this.integrations = integrations;
  }
}

function createDependencyChecks(): DependencyChecks {
  return {
    database: async () => {
      await prisma.$queryRaw`SELECT 1`;
    },
    smtp: async () => {
      await new EmailHealthCheck(createEmailProvider(process.env)).check();
    },
    "blob-storage": checkBlobStorageReadiness,
    redis: async () => {
      const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
      const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
      if (!url || !token) throw new Error("Redis health configuration is missing.");
      await new Redis({ url, token }).ping();
    },
    clamav: checkClamAvReadiness,
  };
}

const integrationDependencies = [
  ["smtp", "smtp"],
  ["redis", "redis"],
  ["clamav", "clamav"],
  ["blobStorage", "blob-storage"],
] as const;

export async function checkApplicationReadiness(
  overrides: Partial<DependencyChecks> = {},
  env: NodeJS.ProcessEnv = process.env,
): Promise<IntegrationReadiness> {
  const checks = { ...createDependencyChecks(), ...overrides };
  const integrations = getIntegrationReadiness(env);
  const dependenciesToCheck: DependencyName[] = ["database"];
  for (const [statusName, dependency] of integrationDependencies) {
    if (integrations[statusName] !== "disabled") {
      dependenciesToCheck.push(dependency);
    }
  }

  const failed: DependencyName[] = [];
  await Promise.all(
    dependenciesToCheck.map(async (dependency) => {
      try {
        await checks[dependency]();
      } catch {
        failed.push(dependency);
        const statusName = integrationDependencies.find(
          ([, name]) => name === dependency,
        )?.[0];
        if (statusName) integrations[statusName] = "unhealthy";
      }
    }),
  );
  if (failed.length > 0) {
    throw new DependencyReadinessError(failed.sort(), integrations);
  }
  return integrations;
}
