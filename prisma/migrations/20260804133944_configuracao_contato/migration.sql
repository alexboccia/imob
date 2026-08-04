-- CreateTable
CREATE TABLE "configuracao_contato" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "telefone" TEXT,
    "email" TEXT,
    "whatsapp" TEXT,
    "instagram" TEXT,
    "facebook" TEXT,
    "youtube" TEXT,
    "linkedin" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracao_contato_pkey" PRIMARY KEY ("id")
);
