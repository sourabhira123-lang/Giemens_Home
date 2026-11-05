import { createHash } from "node:crypto";
import { DefaultAzureCredential } from "@azure/identity";
import {
  BlobServiceClient,
  BlobSASPermissions,
  generateBlobSASQueryParameters,
} from "@azure/storage-blob";

const uploadUrlLifetimeMs = 5 * 60 * 1000;
const downloadUrlLifetimeMs = 5 * 60 * 1000;

function getStorageConfig() {
  const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL?.trim();
  const containerName = process.env.AZURE_STORAGE_CONTAINER?.trim();
  if (!accountUrl || !containerName) {
    throw new Error("Azure Blob Storage configuration is missing.");
  }
  const parsedUrl = new URL(accountUrl);
  if (
    parsedUrl.protocol !== "https:" ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error("AZURE_STORAGE_ACCOUNT_URL must be an HTTPS origin.");
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(containerName)) {
    throw new Error("AZURE_STORAGE_CONTAINER is invalid.");
  }
  const accountName = parsedUrl.hostname.split(".")[0];
  if (!accountName) throw new Error("The Azure storage account URL is invalid.");
  return { accountUrl: parsedUrl.origin, containerName, accountName };
}

let serviceClient: BlobServiceClient | undefined;

function getServiceClient(config: ReturnType<typeof getStorageConfig>) {
  serviceClient ??= new BlobServiceClient(
    config.accountUrl,
    new DefaultAzureCredential(),
  );
  return serviceClient;
}

async function createBlobSas(
  blobName: string,
  permissions: string,
  lifetimeMs: number,
  contentDisposition?: string,
): Promise<string> {
  const config = getStorageConfig();
  const service = getServiceClient(config);
  const container = service.getContainerClient(config.containerName);
  const blob = container.getBlockBlobClient(blobName);
  const startsOn = new Date(Date.now() - 60_000);
  const expiresOn = new Date(Date.now() + lifetimeMs);
  const delegationKey = await service.getUserDelegationKey(startsOn, expiresOn);
  const sas = generateBlobSASQueryParameters(
    {
      containerName: config.containerName,
      blobName,
      permissions: BlobSASPermissions.parse(permissions),
      startsOn,
      expiresOn,
      ...(permissions === "r" ? { contentType: "application/octet-stream" } : {}),
      ...(contentDisposition ? { contentDisposition } : {}),
    },
    delegationKey,
    config.accountName,
  ).toString();
  return `${blob.url}?${sas}`;
}

export async function createBlobUploadUrl(blobName: string): Promise<string> {
  return createBlobSas(blobName, "cw", uploadUrlLifetimeMs);
}

export async function createBlobDownloadUrl(
  blobName: string,
  fileName: string,
): Promise<string> {
  const safeFileName = fileName.replace(/["\\\r\n]/g, "_");
  return createBlobSas(
    blobName,
    "r",
    downloadUrlLifetimeMs,
    `attachment; filename="${safeFileName}"`,
  );
}

export async function verifyUploadedBlob(
  blobName: string,
  expected: {
    sizeBytes: number;
    contentType: string;
    checksumSha256: string;
  },
): Promise<void> {
  const config = getStorageConfig();
  const blob = getServiceClient(config)
    .getContainerClient(config.containerName)
    .getBlockBlobClient(blobName);
  const properties = await blob.getProperties();
  if (properties.contentLength !== expected.sizeBytes) {
    throw new Error("Uploaded document size did not match its declaration.");
  }
  if (properties.contentType !== expected.contentType) {
    throw new Error("Uploaded document type did not match its declaration.");
  }

  const download = await blob.download();
  if (!download.readableStreamBody) {
    throw new Error("Uploaded document content could not be verified.");
  }
  const hash = createHash("sha256");
  let bytesRead = 0;
  const prefix: Buffer[] = [];
  let prefixSize = 0;
  for await (const chunk of download.readableStreamBody) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytesRead += buffer.byteLength;
    if (bytesRead > expected.sizeBytes) {
      throw new Error("Uploaded document exceeded its declared size.");
    }
    hash.update(buffer);
    if (prefixSize < 12) {
      const sample = buffer.subarray(0, 12 - prefixSize);
      prefix.push(sample);
      prefixSize += sample.byteLength;
    }
  }
  const signature = Buffer.concat(prefix);
  const validSignature =
    expected.contentType === "application/pdf"
      ? signature.subarray(0, 5).toString("ascii") === "%PDF-"
      : expected.contentType === "image/jpeg"
        ? signature[0] === 0xff && signature[1] === 0xd8 && signature[2] === 0xff
        : expected.contentType === "image/png"
          ? signature.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : expected.contentType === "image/webp"
            ? signature.subarray(0, 4).toString("ascii") === "RIFF" &&
              signature.subarray(8, 12).toString("ascii") === "WEBP"
            : expected.contentType ===
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
              signature[0] === 0x50 && signature[1] === 0x4b;
  if (!validSignature) {
    throw new Error("Uploaded document signature does not match its declared type.");
  }
  if (
    bytesRead !== expected.sizeBytes ||
    hash.digest("hex") !== expected.checksumSha256
  ) {
    throw new Error("Uploaded document checksum verification failed.");
  }
}
