import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { DocumentCategory } from "@prisma/client";
import {
  getAuthenticatedUser,
  hasSameOrigin,
} from "../server/auth.ts";
import {
  createBlobDownloadUrl,
  createBlobUploadUrl,
  verifyUploadedBlob,
} from "../server/azure-blob-storage.ts";
import { scanUploadedBlob } from "../server/clamav.ts";
import { prisma } from "../server/prisma.ts";
import { recordAuditEvent } from "../server/observability.ts";

type DocumentRequest = IncomingMessage & { body?: unknown };
type DocumentResponse = ServerResponse & { statusCode: number };

const maximumDocumentSize = 20 * 1024 * 1024;
const allowedTypes = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const documentCategories: DocumentCategory[] = [
  "CLIENT_ATTACHMENT",
  "LEGAL",
  "COMPLIANCE",
  "PROPERTY_VERIFICATION",
  "BUSINESS_REGISTRATION",
  "PROJECT",
];

class DocumentInputError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sendJson(response: DocumentResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.end(JSON.stringify(body));
}

function parseBody(request: DocumentRequest): Record<string, unknown> | undefined {
  const raw = request.body;
  if (typeof raw === "string" || Buffer.isBuffer(raw)) {
    const body = Buffer.isBuffer(raw) ? raw.toString("utf8") : raw;
    if (Buffer.byteLength(body, "utf8") > 12_000) return undefined;
    try {
      const parsed: unknown = JSON.parse(body);
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  if (!isRecord(raw)) return undefined;
  try {
    return Buffer.byteLength(JSON.stringify(raw), "utf8") <= 12_000 ? raw : undefined;
  } catch {
    return undefined;
  }
}

function safeFileName(value: unknown): string {
  if (typeof value !== "string") throw new DocumentInputError("Provide a file name.");
  const name = value.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim() ?? "";
  if (!name || name.length > 255 || name === "." || name === "..") {
    throw new DocumentInputError("File name must be between 1 and 255 characters.");
  }
  return name;
}

function canManageDocuments(user: { role: string }): boolean {
  return ["SUPER_ADMIN", "ADMIN", "MANAGER"].includes(user.role);
}

async function checkUploadRateLimit(userId: string): Promise<{ success: boolean; reset: number }> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) throw new Error("Document upload rate-limit configuration is missing.");
  const limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(10, "1 h"),
    prefix: "giemens:documents:upload",
  });
  const result = await limiter.limit(userId);
  return { success: result.success, reset: result.reset };
}

export function createDocumentsHandler(dependencies: {
  authenticate: (request: DocumentRequest) => ReturnType<typeof getAuthenticatedUser>;
  checkUploadRateLimit?: (userId: string) => Promise<{ success: boolean; reset: number }>;
}) {
  return async function documentsHandler(
    request: DocumentRequest,
    response: DocumentResponse,
  ): Promise<void> {
    if (request.method !== "GET" && request.method !== "POST") {
      response.setHeader("Allow", "GET, POST");
      sendJson(response, 405, { error: "Method not allowed." });
      return;
    }
    let user;
    try {
      user = await dependencies.authenticate(request);
    } catch (error) {
      console.error("Document authentication failed:", error instanceof Error ? error.name : "UnknownError");
      sendJson(response, 503, { error: "Document access is temporarily unavailable." });
      return;
    }
    if (!user) {
      sendJson(response, 401, { error: "Sign in to access documents." });
      return;
    }

    const url = new URL(request.url ?? "/api/documents", "http://localhost");
    if (request.method === "GET") {
      const documentId = url.searchParams.get("id");
      if (documentId) {
        if (!validId(documentId)) {
          sendJson(response, 400, { error: "Submit a valid document ID." });
          return;
        }
        try {
          const document = await prisma.document.findUnique({
            where: { id: documentId },
          });
          if (!document || document.status !== "READY") {
            sendJson(response, 404, { error: "The document is not available." });
            return;
          }
          if (document.ownerUserId !== user.id && !canManageDocuments(user)) {
            sendJson(response, 403, { error: "Your role cannot access this document." });
            return;
          }
          const downloadUrl = await createBlobDownloadUrl(document.storageKey, document.fileName);
          sendJson(response, 200, { downloadUrl, expiresInSeconds: 300 });
        } catch (error) {
          console.error("Document download URL failed:", error instanceof Error ? error.name : "UnknownError");
          sendJson(response, 503, { error: "The document could not be made available." });
        }
        return;
      }

      const requestId = url.searchParams.get("requestId");
      if (requestId && !validId(requestId)) {
        sendJson(response, 400, { error: "Submit a valid request ID." });
        return;
      }
      if (!canManageDocuments(user) && requestId) {
        sendJson(response, 403, { error: "Your role cannot list request attachments." });
        return;
      }
      try {
        const items = await prisma.document.findMany({
          where: {
            status: "READY",
            ...(canManageDocuments(user) ? {} : { ownerUserId: user.id }),
            ...(requestId ? { requests: { some: { requestId } } } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: {
            id: true,
            fileName: true,
            contentType: true,
            sizeBytes: true,
            category: true,
            tags: true,
            ownerUserId: true,
            createdAt: true,
            requests: { select: { requestId: true } },
          },
        });
        sendJson(response, 200, { items });
      } catch (error) {
        console.error("Document list failed:", error instanceof Error ? error.name : "UnknownError");
        sendJson(response, 503, { error: "Documents could not be loaded." });
      }
      return;
    }

    if (!hasSameOrigin(request)) {
      sendJson(response, 403, { error: "This request is not allowed." });
      return;
    }
    if (request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase() !== "application/json") {
      sendJson(response, 415, { error: "Submit document metadata as JSON." });
      return;
    }
    const input = parseBody(request);
    if (!input) {
      sendJson(response, 400, { error: "Submit valid document metadata." });
      return;
    }

    try {
      if (input.action === "initiate") {
        const fileName = safeFileName(input.fileName);
        const contentType = typeof input.contentType === "string" ? input.contentType : "";
        const sizeBytes = Number(input.sizeBytes);
        const checksumSha256 = typeof input.checksumSha256 === "string"
          ? input.checksumSha256.toLowerCase()
          : "";
        const category = input.category;
        const requestId = input.requestId === null || input.requestId === undefined
          ? undefined
          : input.requestId;
        if (!allowedTypes.has(contentType)) {
          throw new DocumentInputError("Upload a PDF, DOCX, JPEG, PNG or WebP file.");
        }
        if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > maximumDocumentSize) {
          throw new DocumentInputError("Each document must be no larger than 20 MB.");
        }
        if (!/^[a-f0-9]{64}$/.test(checksumSha256)) {
          throw new DocumentInputError("The document checksum is invalid.");
        }
        if (!documentCategories.includes(category as DocumentCategory)) {
          throw new DocumentInputError("Select a valid document category.");
        }
        if (requestId !== undefined && !validId(requestId)) {
          throw new DocumentInputError("Select a valid Jurivana request.");
        }
        if (
          input.tags !== undefined &&
          (!Array.isArray(input.tags) ||
            input.tags.length > 10 ||
            input.tags.some((tag) =>
              typeof tag !== "string" || !tag.trim() || tag.trim().length > 40
            ))
        ) {
          throw new DocumentInputError("Use up to 10 document tags of 1-40 characters each.");
        }
        const tags = Array.isArray(input.tags)
          ? input.tags.map((tag) => (tag as string).trim())
          : [];
        if (requestId) {
          const parentRequest = await prisma.jurivanaRequest.findUnique({
            where: { id: requestId },
            select: { id: true },
          });
          if (!parentRequest) {
            sendJson(response, 404, { error: "The Jurivana request was not found." });
            return;
          }
        }
        let rateLimit: { success: boolean; reset: number };
        try {
          rateLimit = await (dependencies.checkUploadRateLimit ?? checkUploadRateLimit)(user.id);
        } catch (error) {
          console.error("Document upload rate-limit failed:", error instanceof Error ? error.name : "UnknownError");
          sendJson(response, 503, { error: "Document uploads are temporarily unavailable." });
          return;
        }
        if (!rateLimit.success) {
          response.setHeader("Retry-After", String(Math.max(1, Math.ceil((rateLimit.reset - Date.now()) / 1000))));
          sendJson(response, 429, { error: "Too many uploads. Try again later." });
          return;
        }
        const documentId = randomUUID();
        const storageKey = `client-attachments/${user.id}/${documentId}`;
        const uploadUrl = await createBlobUploadUrl(storageKey);
        const document = await prisma.$transaction(async (database) => {
          const created = await database.document.create({
            data: {
              id: documentId,
              fileName,
              contentType,
              sizeBytes,
              checksumSha256,
              storageKey,
              category: category as DocumentCategory,
              tags,
              ownerUserId: user.id,
            },
            select: { id: true, fileName: true, status: true },
          });
          if (typeof requestId === "string") {
            await database.requestDocument.create({
              data: { requestId, documentId },
            });
          }
          await database.auditLog.create({
            data: {
              actorUserId: user.id,
              action: "document.upload.initiated",
              entityType: "document",
              entityId: documentId,
            },
          });
          return created;
        });
        recordAuditEvent("document.upload.initiated");
        sendJson(response, 201, {
          document,
          uploadUrl,
          uploadHeaders: {
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": contentType,
          },
          expiresInSeconds: 300,
        });
        return;
      }

      if (input.action === "complete") {
        if (!validId(input.documentId)) {
          throw new DocumentInputError("Submit a valid document ID.");
        }
        const document = await prisma.document.findUnique({
          where: { id: input.documentId },
        });
        if (!document || document.status !== "PENDING_UPLOAD") {
          sendJson(response, 404, { error: "The pending document upload was not found." });
          return;
        }
        if (document.ownerUserId !== user.id && !canManageDocuments(user)) {
          sendJson(response, 403, { error: "Your role cannot complete this upload." });
          return;
        }
        try {
          await verifyUploadedBlob(document.storageKey, {
            sizeBytes: document.sizeBytes,
            contentType: document.contentType,
            checksumSha256: document.checksumSha256,
          });
        } catch (error) {
          console.error("Uploaded document verification failed:", error instanceof Error ? error.name : "UnknownError");
          sendJson(response, 400, { error: "The uploaded file did not pass integrity verification." });
          return;
        }
        let scanResult: "clean" | "infected";
        try {
          scanResult = await scanUploadedBlob(document.storageKey, document.sizeBytes);
        } catch (error) {
          console.error("Document malware scan is unavailable:", error instanceof Error ? error.name : "UnknownError");
          sendJson(response, 503, { error: "The document is quarantined until its security scan can complete." });
          return;
        }
        if (scanResult === "infected") {
          const rejected = await prisma.$transaction(async (database) => {
            const result = await database.document.updateMany({
              where: { id: document.id, status: "PENDING_UPLOAD" },
              data: { status: "REJECTED" },
            });
            if (result.count !== 1) return false;
            await database.auditLog.create({
              data: {
                actorUserId: user.id,
                action: "document.scan.rejected",
                entityType: "document",
                entityId: document.id,
              },
            });
            return true;
          });
          if (!rejected) {
            sendJson(response, 409, { error: "The document upload is no longer available for scanning." });
            return;
          }
          recordAuditEvent("document.scan.rejected");
          sendJson(response, 422, { error: "The uploaded file failed the malware scan." });
          return;
        }
        const updated = await prisma.$transaction(async (database) => {
          const result = await database.document.updateMany({
            where: { id: document.id, status: "PENDING_UPLOAD" },
            data: { status: "READY" },
          });
          if (result.count !== 1) return undefined;
          const ready = await database.document.findUniqueOrThrow({
            where: { id: document.id },
            select: {
              id: true,
              fileName: true,
              contentType: true,
              sizeBytes: true,
              category: true,
              tags: true,
              status: true,
            },
          });
          await database.auditLog.create({
            data: {
              actorUserId: user.id,
              action: "document.upload.completed",
              entityType: "document",
              entityId: document.id,
            },
          });
          return ready;
        });
        if (!updated) {
          sendJson(response, 409, { error: "The document upload is no longer available for scanning." });
          return;
        }
        recordAuditEvent("document.upload.completed");
        sendJson(response, 200, { document: updated });
        return;
      }

      throw new DocumentInputError("Select a valid document action.");
    } catch (error) {
      if (error instanceof DocumentInputError) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;
      if (code === "P2025") {
        sendJson(response, 404, { error: "The related record was not found." });
        return;
      }
      console.error("Document operation failed:", error instanceof Error ? error.name : "UnknownError");
      sendJson(response, 503, { error: "The document operation could not be completed." });
    }
  };
}

export default createDocumentsHandler({ authenticate: getAuthenticatedUser });
