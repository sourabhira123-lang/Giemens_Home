export const supportedDocumentContentTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type DocumentContentType = (typeof supportedDocumentContentTypes)[number];
export type DocumentCategory =
  | "CLIENT_ATTACHMENT"
  | "LEGAL"
  | "COMPLIANCE"
  | "PROPERTY_VERIFICATION"
  | "BUSINESS_REGISTRATION"
  | "PROJECT";

export type DocumentMetadata = {
  id: string;
  tenantId: string;
  ownerUserId: string;
  fileName: string;
  contentType: DocumentContentType;
  sizeBytes: number;
  checksumSha256: string;
  category: DocumentCategory;
  tags: readonly string[];
  createdAt: string;
};

export type DocumentUpload = {
  tenantId: string;
  ownerUserId: string;
  fileName: string;
  contentType: DocumentContentType;
  sizeBytes: number;
  checksumSha256: string;
  category: DocumentCategory;
  tags: readonly string[];
  content: Uint8Array;
};

export type StoredDocument = {
  metadata: DocumentMetadata;
  storageKey: string;
};

export interface DocumentStorage {
  store(upload: DocumentUpload): Promise<StoredDocument>;
  delete(documentId: string, tenantId: string): Promise<void>;
  createDownloadUrl(
    documentId: string,
    tenantId: string,
    expiresInSeconds: number,
  ): Promise<string>;
}
