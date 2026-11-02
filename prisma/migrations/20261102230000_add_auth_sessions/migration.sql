-- CreateTable
CREATE TABLE "giemens_crm"."sessions" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "giemens_crm"."auth_rate_limits" (
    "key_hash" CHAR(64) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "window_started_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auth_rate_limits_pkey" PRIMARY KEY ("key_hash")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "giemens_crm"."sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_expires_at_idx" ON "giemens_crm"."sessions"("user_id", "expires_at");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "giemens_crm"."sessions"("expires_at");

-- CreateIndex
CREATE INDEX "auth_rate_limits_window_started_at_idx" ON "giemens_crm"."auth_rate_limits"("window_started_at");

-- AddForeignKey
ALTER TABLE "giemens_crm"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "giemens_crm"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
