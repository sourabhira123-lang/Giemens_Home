-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "giemens_crm";

-- CreateEnum
CREATE TYPE "giemens_crm"."LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL_SENT', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "giemens_crm"."BusinessDivision" AS ENUM ('JURIVANA', 'TECHNOLOGY', 'ENGINEERING', 'COMMERCE', 'CONSULTING', 'ACADEMY', 'CORPORATE');

-- CreateEnum
CREATE TYPE "giemens_crm"."TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

-- CreateTable
CREATE TABLE "giemens_crm"."roles" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(240),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giemens_crm"."users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "password_hash" VARCHAR(255),
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giemens_crm"."leads" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "phone" VARCHAR(24),
    "company" VARCHAR(160),
    "message" VARCHAR(5000) NOT NULL,
    "division" "giemens_crm"."BusinessDivision" NOT NULL,
    "source" VARCHAR(100) NOT NULL,
    "status" "giemens_crm"."LeadStatus" NOT NULL DEFAULT 'NEW',
    "subject" VARCHAR(180) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giemens_crm"."activities" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "user_id" UUID,
    "type" VARCHAR(80) NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giemens_crm"."customers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(254),
    "phone" VARCHAR(24),
    "lead_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giemens_crm"."projects" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(5000),
    "customer_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giemens_crm"."tasks" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "title" VARCHAR(240) NOT NULL,
    "details" VARCHAR(5000),
    "status" "giemens_crm"."TaskStatus" NOT NULL DEFAULT 'OPEN',
    "due_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "giemens_crm"."roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "giemens_crm"."users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "giemens_crm"."users"("role_id");

-- CreateIndex
CREATE INDEX "leads_status_created_at_idx" ON "giemens_crm"."leads"("status", "created_at");

-- CreateIndex
CREATE INDEX "leads_division_status_created_at_idx" ON "giemens_crm"."leads"("division", "status", "created_at");

-- CreateIndex
CREATE INDEX "leads_email_idx" ON "giemens_crm"."leads"("email");

-- CreateIndex
CREATE INDEX "activities_lead_id_created_at_idx" ON "giemens_crm"."activities"("lead_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "customers_lead_id_key" ON "giemens_crm"."customers"("lead_id");

-- CreateIndex
CREATE INDEX "customers_email_idx" ON "giemens_crm"."customers"("email");

-- CreateIndex
CREATE INDEX "projects_customer_id_idx" ON "giemens_crm"."projects"("customer_id");

-- CreateIndex
CREATE INDEX "tasks_project_id_status_idx" ON "giemens_crm"."tasks"("project_id", "status");

-- CreateIndex
CREATE INDEX "tasks_status_due_at_idx" ON "giemens_crm"."tasks"("status", "due_at");

-- AddForeignKey
ALTER TABLE "giemens_crm"."users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "giemens_crm"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giemens_crm"."activities" ADD CONSTRAINT "activities_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "giemens_crm"."leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giemens_crm"."activities" ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "giemens_crm"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giemens_crm"."customers" ADD CONSTRAINT "customers_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "giemens_crm"."leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giemens_crm"."projects" ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "giemens_crm"."customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "giemens_crm"."tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "giemens_crm"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
