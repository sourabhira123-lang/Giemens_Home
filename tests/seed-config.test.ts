import assert from "node:assert/strict";
import { test } from "node:test";
import { readAdminSeedConfig } from "../server/seed-config.ts";

test("validates admin seed fields and enforces UTF-8 password byte limits", () => {
  const config = readAdminSeedConfig({
    ADMIN_EMAIL: " ADMIN@GIEMENS.TEST ",
    ADMIN_NAME: " GIEMENS Bootstrap Admin ",
    ADMIN_PASSWORD: "a-unique-local-secret-457",
  });
  assert.equal(config.email, "admin@giemens.test");
  assert.equal(config.name, "GIEMENS Bootstrap Admin");

  for (const password of [
    "",
    "short",
    "password-is-not-unique",
    "replace-me-with-a-secret",
    "é".repeat(65),
  ]) {
    assert.throws(
      () => readAdminSeedConfig({ ADMIN_PASSWORD: password }),
      /12 and 128 UTF-8 bytes/,
    );
  }
});
