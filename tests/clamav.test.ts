import assert from "node:assert/strict";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { scanStreamWithClamAv } from "../server/clamav.ts";

async function* sourceOf(data: string): AsyncGenerator<Buffer> {
  yield Buffer.from(data);
}

async function startClamServer(result: string) {
  const server = createServer((socket) => {
    let input = Buffer.alloc(0);
    let commandRead = false;
    socket.on("data", (chunk: Buffer) => {
      input = Buffer.concat([input, chunk]);
      if (!commandRead) {
        const commandEnd = input.indexOf(0);
        if (commandEnd < 0) return;
        input = input.subarray(commandEnd + 1);
        commandRead = true;
      }
      while (input.byteLength >= 4) {
        const length = input.readUInt32BE(0);
        if (input.byteLength < 4 + length) return;
        input = input.subarray(4 + length);
        if (length === 0) {
          socket.end(`stream: ${result}\0`);
          return;
        }
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return { server, port: address.port };
}

test("sends a framed stream to ClamAV and accepts a clean result", async () => {
  const { server, port } = await startClamServer("OK");
  try {
    const result = await scanStreamWithClamAv(
      sourceOf("safe-content"),
      { host: "127.0.0.1", port, maximumBytes: 100 },
    );
    assert.equal(result, "clean");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("returns infected results and rejects a stream exceeding the scan limit", async () => {
  const { server, port } = await startClamServer("Eicar-Test-Signature FOUND");
  try {
    const result = await scanStreamWithClamAv(
      sourceOf("sample"),
      { host: "127.0.0.1", port, maximumBytes: 100 },
    );
    assert.equal(result, "infected");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  await assert.rejects(
    scanStreamWithClamAv(
      sourceOf("too large"),
      { host: "127.0.0.1", port: 1, maximumBytes: 2 },
    ),
    /scan limit|connect/i,
  );
});
