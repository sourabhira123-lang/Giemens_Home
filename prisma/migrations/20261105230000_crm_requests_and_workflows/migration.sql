CREATE TYPE "giemens_crm"."ProjectStatus" AS ENUM (
    'PLANNED',
    'ACTIVE',
    'ON_HOLD',
    'COMPLETED',
    'CANCELLED'
);

CREATE TYPE "giemens_crm"."JurivanaRequestType" AS ENUM (
    'LEGAL',
    'COMPLIANCE',
    'PROPERTY_VERIFICATION',
    'BUSINESS_REGISTRATION'
);

CREATE TYPE "giemens_crm"."JurivanaRequestStatus" AS ENUM (
    'SUBMITTED',
    'IN_REVIEW',
    'NEEDS_INFORMATION',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);

CREATE TYPE "giemens_crm"."DocumentCategory" AS ENUM (
    'CLIENT_ATTACHMENT',
    'LEGAL',
    'COMPLIANCE',
    'PROPERTY_VERIFICATION',
    'BUSINESS_REGISTRATION',
    'PROJECT'
);

CREATE TYPE "giemens_crm"."DocumentStatus" AS ENUM (
    'PENDING_UPLOAD',
    'READY'
);

ALTER TABLE "giemens_crm"."projects"
ADD COLUMN "status" "giemens_crm"."ProjectStatus" NOT NULL DEFAULT 'PLANNED';

ALTER TABLE "giemens_crm"."tasks"
ADD COLUMN "assigned_to_id" UUID;

CREATE INDEX "tasks_assigned_to_id_status_idx"
ON "giemens_crm"."tasks"("assigned_to_id", "status");

ALTER TABLE "giemens_crm"."tasks"
ADD CONSTRAINT "tasks_assigned_to_id_fkey"
FOREIGN KEY ("assigned_to_id") REFERENCES "giemens_crm"."users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "giemens_crm"."jurivana_requests" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "type" "giemens_crm"."JurivanaRequestType" NOT NULL,
    "status" "giemens_crm"."JurivanaRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "title" VARCHAR(240) NOT NULL,
    "description" VARCHAR(5000) NOT NULL,
    "assigned_to_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "jurivana_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "giemens_crm"."request_comments" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "body" VARCHAR(5000) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "request_comments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "giemens_crm"."documents" (
    "id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "content_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum_sha256" CHAR(64) NOT NULL,
    "storage_key" VARCHAR(512) NOT NULL,
    "category" "giemens_crm"."DocumentCategory" NOT NULL,
    "status" "giemens_crm"."DocumentStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "owner_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "giemens_crm"."request_documents" (
    "request_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "request_documents_pkey" PRIMARY KEY ("request_id", "document_id")
);

CREATE UNIQUE INDEX "documents_storage_key_key"
ON "giemens_crm"."documents"("storage_key");

CREATE INDEX "jurivana_requests_customer_id_created_at_idx"
ON "giemens_crm"."jurivana_requests"("customer_id", "created_at");

CREATE INDEX "jurivana_requests_type_status_created_at_idx"
ON "giemens_crm"."jurivana_requests"("type", "status", "created_at");

CREATE INDEX "jurivana_requests_assigned_to_id_status_idx"
ON "giemens_crm"."jurivana_requests"("assigned_to_id", "status");

CREATE INDEX "request_comments_request_id_created_at_idx"
ON "giemens_crm"."request_comments"("request_id", "created_at");

CREATE INDEX "documents_owner_user_id_created_at_idx"
ON "giemens_crm"."documents"("owner_user_id", "created_at");

CREATE INDEX "documents_category_created_at_idx"
ON "giemens_crm"."documents"("category", "created_at");

CREATE INDEX "documents_status_created_at_idx"
ON "giemens_crm"."documents"("status", "created_at");

CREATE INDEX "request_documents_document_id_idx"
ON "giemens_crm"."request_documents"("document_id");

ALTER TABLE "giemens_crm"."jurivana_requests"
ADD CONSTRAINT "jurivana_requests_customer_id_fkey"
FOREIGN KEY ("customer_id") REFERENCES "giemens_crm"."customers"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "giemens_crm"."jurivana_requests"
ADD CONSTRAINT "jurivana_requests_assigned_to_id_fkey"
FOREIGN KEY ("assigned_to_id") REFERENCES "giemens_crm"."users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "giemens_crm"."request_comments"
ADD CONSTRAINT "request_comments_request_id_fkey"
FOREIGN KEY ("request_id") REFERENCES "giemens_crm"."jurivana_requests"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "giemens_crm"."request_comments"
ADD CONSTRAINT "request_comments_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "giemens_crm"."users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "giemens_crm"."documents"
ADD CONSTRAINT "documents_owner_user_id_fkey"
FOREIGN KEY ("owner_user_id") REFERENCES "giemens_crm"."users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "giemens_crm"."request_documents"
ADD CONSTRAINT "request_documents_request_id_fkey"
FOREIGN KEY ("request_id") REFERENCES "giemens_crm"."jurivana_requests"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "giemens_crm"."request_documents"
ADD CONSTRAINT "request_documents_document_id_fkey"
FOREIGN KEY ("document_id") REFERENCES "giemens_crm"."documents"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "giemens_crm"."audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" UUID,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_actor_user_id_created_at_idx"
ON "giemens_crm"."audit_logs"("actor_user_id", "created_at");

CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx"
ON "giemens_crm"."audit_logs"("entity_type", "entity_id", "created_at");

ALTER TABLE "giemens_crm"."audit_logs"
ADD CONSTRAINT "audit_logs_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "giemens_crm"."users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
