import assert from "node:assert/strict";
import { test } from "node:test";
import { createInMemoryRateLimiter } from "../server/in-memory-rate-limit.ts";

test("in-memory rate limiter enforces the request limit and expires entries", async () => {
  const limit = createInMemoryRateLimiter(2, 20);
  assert.equal((await limit("client-a")).success, true);
  assert.equal((await limit("client-a")).success, true);
  const blocked = await limit("client-a");
  assert.equal(blocked.success, false);
  assert.ok(blocked.reset > Date.now());

  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal((await limit("client-a")).success, true);
});

test("in-memory rate limiter bounds the number of tracked clients", async () => {
  const limit = createInMemoryRateLimiter(1, 60_000, 1);
  assert.equal((await limit("client-a")).success, true);
  assert.equal((await limit("client-b")).success, false);
});
