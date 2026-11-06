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
  await checkApplicationReadiness(
    createChecks(async (dependency) => {
      checked.push(dependency);
    }),
  );
  assert.deepEqual(checked.sort(), [...requiredDependencies].sort());
});

test("readiness identifies failed required dependencies without exposing details", async () => {
  const error = await checkApplicationReadiness(
    createChecks(async (dependency) => {
      if (dependency === "smtp" || dependency === "redis") {
        throw new Error("sensitive provider detail");
      }
    }),
  ).then(
    () => null,
    (failure: unknown) => failure,
  );

  assert.ok(error instanceof DependencyReadinessError);
  assert.deepEqual(error.dependencies, ["redis", "smtp"]);
  assert.doesNotMatch(error.message, /sensitive provider detail/);
});
