import { deleteBlobIfExists } from "../server/azure-blob-storage.ts";
import { prisma } from "../server/prisma.ts";
import { recordAuditEvent } from "../server/observability.ts";

function readRetention(name: string, defaultValue: number, maximum: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return defaultValue;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer between 1 and ${maximum}.`);
  }
  return value;
}

async function main(): Promise<void> {
  const pendingHours = readRetention("DOCUMENT_PENDING_RETENTION_HOURS", 24, 168);
  const rejectedDays = readRetention("DOCUMENT_REJECTED_RETENTION_DAYS", 30, 3650);
  const pendingCutoff = new Date(Date.now() - pendingHours * 60 * 60 * 1000);
  const rejectedCutoff = new Date(Date.now() - rejectedDays * 24 * 60 * 60 * 1000);
  const candidates = await prisma.document.findMany({
    where: {
      OR: [
        { status: "PENDING_UPLOAD", createdAt: { lt: pendingCutoff } },
        { status: "REJECTED", updatedAt: { lt: rejectedCutoff } },
        { status: "EXPIRING" },
      ],
    },
    select: { id: true, storageKey: true, status: true, createdAt: true, updatedAt: true },
    take: 500,
    orderBy: { createdAt: "asc" },
  });

  const failures: string[] = [];
  for (const document of candidates) {
    try {
      if (document.status !== "EXPIRING") {
        const transitioned = await prisma.document.updateMany({
          where: {
            id: document.id,
            status: document.status,
            updatedAt: document.updatedAt,
          },
          data: { status: "EXPIRING" },
        });
        if (transitioned.count !== 1) continue;
      }
      await deleteBlobIfExists(document.storageKey);
      await prisma.$transaction(async (database) => {
        const current = await database.document.deleteMany({
          where: { id: document.id, status: "EXPIRING" },
        });
        if (current.count !== 1) return;
        await database.auditLog.create({
          data: {
            action: "document.cleanup.deleted",
            entityType: "document",
            entityId: document.id,
            details: { previousStatus: document.status },
          },
        });
      });
      recordAuditEvent("document.cleanup.deleted");
    } catch (error) {
      failures.push(document.id);
      console.error(JSON.stringify({
        event: "document.cleanup.failed",
        documentId: document.id,
        error: error instanceof Error ? error.name : "UnknownError",
      }));
    }
  }

  console.info(JSON.stringify({
    event: "document.cleanup.completed",
    examined: candidates.length,
    failed: failures.length,
  }));
  if (failures.length > 0) {
    throw new Error(`Document cleanup failed for ${failures.length} records.`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(JSON.stringify({
      event: "document.cleanup.aborted",
      error: error instanceof Error ? error.message : "UnknownError",
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
