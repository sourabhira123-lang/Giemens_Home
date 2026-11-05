import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { createHttpServer } from "../server/http.ts";

test("container HTTP server serves health, prerendered pages, and safe API errors", async () => {
  const directory = await mkdtemp(join(tmpdir(), "giemens-http-"));
  const distDirectory = join(directory, "dist");
  await mkdir(distDirectory);
  await writeFile(join(distDirectory, "index.html"), "<main>GIEMENS</main>");

  const server = createHttpServer({ distDirectory });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${address.port}`;

    const health = await fetch(`${origin}/healthz`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), "ok");

    const route = await fetch(`${origin}/admin/dashboard`);
    assert.equal(route.status, 200);
    assert.match(await route.text(), /GIEMENS/);
    assert.equal(route.headers.get("content-security-policy") !== null, true);

    const missingAsset = await fetch(`${origin}/missing.js`);
    assert.equal(missingAsset.status, 404);

    const missingApi = await fetch(`${origin}/api/unknown`);
    assert.equal(missingApi.status, 404);
    assert.deepEqual(await missingApi.json(), { error: "Not found." });

    const crmAuth = await fetch(`${origin}/api/crm?resource=customers`);
    assert.equal(crmAuth.status, 401);

    const documentsAuth = await fetch(`${origin}/api/documents`);
    assert.equal(documentsAuth.status, 401);

    const traversal = await fetch(`${origin}/%2e%2e%2f.env`);
    assert.equal(traversal.status, 404);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
