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

export class DependencyReadinessError extends Error {
  readonly dependencies: DependencyName[];

  constructor(dependencies: DependencyName[]) {
    super(`Dependency readiness failed: ${dependencies.join(", ")}`);
    this.name = "DependencyReadinessError";
    this.dependencies = dependencies;
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

export async function checkApplicationReadiness(
  overrides: Partial<DependencyChecks> = {},
): Promise<void> {
  const checks = { ...createDependencyChecks(), ...overrides };
  const failed: DependencyName[] = [];
  await Promise.all(
    requiredDependencies.map(async (dependency) => {
      try {
        await checks[dependency]();
      } catch {
        failed.push(dependency);
      }
    }),
  );
  if (failed.length > 0) {
    throw new DependencyReadinessError(failed.sort());
  }
}
