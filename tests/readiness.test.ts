import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkApplicationReadiness,
  DependencyReadinessError,
  requiredDependencies,
  type DependencyChecks,
} from "../server/readiness.ts";

function createChecks(
  check: (dependency: (typeof requiredDependencies)[number]) => Promise<void>,
): DependencyChecks {
  return Object.fromEntries(
    requiredDependencies.map((dependency) => [
      dependency,
      () => check(dependency),
    ]),
  ) as DependencyChecks;
}

test("readiness waits for every required dependency check", async () => {
  const checked: string[] = [];
  const integrations = await checkApplicationReadiness(
    createChecks(async (dependency) => {
      checked.push(dependency);
    }),
    {
      SMTP_USER: "smtp-user",
      SMTP_PASSWORD: "smtp-password",
      SMTP_HOST: "smtp.test",
      UPSTASH_REDIS_REST_URL: "https://redis.test",
      UPSTASH_REDIS_REST_TOKEN: "redis-token",
      CLAMAV_HOST: "clamav.internal",
      AZURE_STORAGE_ACCOUNT_URL: "https://storage.test",
      AZURE_STORAGE_CONTAINER: "documents",
    },
  );
  assert.deepEqual(checked.sort(), [...requiredDependencies].sort());
  assert.deepEqual(integrations, {
    smtp: "healthy",
    redis: "healthy",
    clamav: "healthy",
    blobStorage: "healthy",
  });
});

test("readiness identifies failed required dependencies without exposing details", async () => {
  const error = await checkApplicationReadiness(
    createChecks(async (dependency) => {
      if (dependency === "smtp" || dependency === "redis") {
        throw new Error("sensitive provider detail");
      }
    }),
    {
      SMTP_USER: "smtp-user",
      SMTP_PASSWORD: "smtp-password",
      SMTP_HOST: "smtp.test",
      UPSTASH_REDIS_REST_URL: "https://redis.test",
      UPSTASH_REDIS_REST_TOKEN: "redis-token",
    },
  ).then(
    () => null,
    (failure: unknown) => failure,
  );

  assert.ok(error instanceof DependencyReadinessError);
  assert.deepEqual(error.dependencies, ["redis", "smtp"]);
  assert.equal(error.integrations.redis, "unhealthy");
  assert.equal(error.integrations.smtp, "unhealthy");
  assert.doesNotMatch(error.message, /sensitive provider detail/);
});

test("disabled optional integrations do not block readiness", async () => {
  const checked: string[] = [];
  const integrations = await checkApplicationReadiness(
    createChecks(async (dependency) => {
      checked.push(dependency);
    }),
    {},
  );
  assert.deepEqual(checked, ["database"]);
  assert.deepEqual(integrations, {
    smtp: "disabled",
    redis: "disabled",
    clamav: "disabled",
    blobStorage: "disabled",
  });
});
