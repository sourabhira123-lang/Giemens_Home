import { createConnection } from "node:net";
import { once } from "node:events";
import { prisma } from "./prisma.ts";
import { getQuarantinedBlobStream } from "./azure-blob-storage.ts";

type ScanResult = "clean" | "infected";

async function writeChunk(
  socket: ReturnType<typeof createConnection>,
  chunk: Buffer,
): Promise<void> {
  if (!socket.write(chunk)) await once(socket, "drain");
}

export async function scanStreamWithClamAv(
  source: AsyncIterable<Uint8Array>,
  options: { host: string; port: number; maximumBytes: number },
): Promise<ScanResult> {
  if (!options.host || /[\s\r\n]/.test(options.host)) {
    throw new Error("CLAMAV_HOST must be a hostname without whitespace.");
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error("CLAMAV_PORT must be an integer between 1 and 65535.");
  }
  const socket = createConnection({ host: options.host, port: options.port });
  socket.setTimeout(60_000);

  return new Promise<ScanResult>((resolve, reject) => {
    let response = Buffer.alloc(0);
    let settled = false;
    const finish = (error?: Error, result?: ScanResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error);
      else if (result) resolve(result);
      else reject(new Error("ClamAV returned an empty scan result."));
    };

    socket.on("data", (chunk: Buffer) => {
      response = Buffer.concat([response, chunk]);
      if (response.byteLength > 4096) {
        finish(new Error("ClamAV returned an oversized response."));
        return;
      }
      const terminator = response.indexOf(0);
      if (terminator < 0) return;
      const message = response.subarray(0, terminator).toString("utf8");
      if (/:\sOK$/.test(message)) finish(undefined, "clean");
      else if (/:\s.+\sFOUND$/.test(message)) finish(undefined, "infected");
      else finish(new Error("ClamAV did not return a valid scan result."));
    });
    socket.once("error", (error) => finish(error));
    socket.once("timeout", () => finish(new Error("ClamAV scan timed out.")));
    socket.once("connect", () => {
      void (async () => {
        try {
          await writeChunk(socket, Buffer.from("zINSTREAM\0"));
          let bytesScanned = 0;
          for await (const input of source) {
            const chunk = Buffer.from(input);
            bytesScanned += chunk.byteLength;
            if (bytesScanned > options.maximumBytes) {
              throw new Error("Document exceeded the configured ClamAV scan limit.");
            }
            if (chunk.byteLength > 0) {
              const length = Buffer.allocUnsafe(4);
              length.writeUInt32BE(chunk.byteLength);
              await writeChunk(socket, length);
              await writeChunk(socket, chunk);
            }
          }
          await writeChunk(socket, Buffer.alloc(4));
        } catch (error) {
          finish(error instanceof Error ? error : new Error("ClamAV scan failed."));
        }
      })();
    });
  });
}

export async function scanUploadedBlob(
  storageKey: string,
  maximumBytes: number,
): Promise<ScanResult> {
  const host = process.env.CLAMAV_HOST?.trim();
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  if (!host) throw new Error("CLAMAV_HOST is not configured.");

  const stream = await getQuarantinedBlobStream(storageKey);
  if (!stream) throw new Error("Uploaded document content could not be scanned.");
  const blobStream = stream;
  async function* bytes(): AsyncGenerator<Buffer> {
    for await (const chunk of blobStream) {
      yield Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    }
  }
  return scanStreamWithClamAv(bytes(), { host, port, maximumBytes });
}

export async function getDocumentScanReadiness(): Promise<void> {
  const host = process.env.CLAMAV_HOST?.trim();
  const port = Number(process.env.CLAMAV_PORT ?? 3310);
  if (!host) throw new Error("CLAMAV_HOST is not configured.");
  await prisma.$queryRaw`SELECT 1`;
  const socket = createConnection({ host, port });
  socket.setTimeout(2_000);
  try {
    await once(socket, "connect");
  } finally {
    socket.destroy();
  }
}
