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

  let ready = true;
  const server = createHttpServer({
    distDirectory,
    checkReadiness: async () => {
      if (!ready) throw new Error("database unavailable");
    },
  });
  const previousMetricsToken = process.env.METRICS_AUTH_TOKEN;
  process.env.METRICS_AUTH_TOKEN = "test-metrics-token-32-characters-long";
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
    assert.ok(health.headers.get("x-request-id"));
    assert.ok(health.headers.get("x-content-type-options"));

    for (const path of ["/health", "/liveness"]) {
      const response = await fetch(`${origin}${path}`);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "ok");
    }

    const readiness = await fetch(`${origin}/ready`);
    assert.equal(readiness.status, 200);
    assert.equal(await readiness.text(), "ready");
    const invalidProbeMethod = await fetch(`${origin}/ready`, { method: "POST" });
    assert.equal(invalidProbeMethod.status, 405);
    ready = false;
    const unavailable = await fetch(`${origin}/ready`);
    assert.equal(unavailable.status, 503);
    assert.equal(await unavailable.text(), "not ready");

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

    const hiddenMetrics = await fetch(`${origin}/metrics`);
    assert.equal(hiddenMetrics.status, 404);
    const metrics = await fetch(`${origin}/metrics`, {
      headers: { authorization: `Bearer ${process.env.METRICS_AUTH_TOKEN}` },
    });
    assert.equal(metrics.status, 200);
    assert.match(metrics.headers.get("content-type") ?? "", /text\/plain/);
    assert.match(await metrics.text(), /http_server_requests_total/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousMetricsToken === undefined) delete process.env.METRICS_AUTH_TOKEN;
    else process.env.METRICS_AUTH_TOKEN = previousMetricsToken;
    await rm(directory, { recursive: true, force: true });
  }
});
