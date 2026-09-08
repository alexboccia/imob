-- CreateTable
CREATE TABLE "signup_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "orgName" TEXT NOT NULL,
    "orgSlug" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signup_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signup_tokens_tokenHash_key" ON "signup_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "signup_tokens_email_idx" ON "signup_tokens"("email");
