-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('ADMINISTRADOR', 'GESTOR', 'CORRETOR');

-- CreateEnum
CREATE TYPE "FinalidadeImovel" AS ENUM ('VENDA', 'ALUGUEL', 'VENDA_E_ALUGUEL');

-- CreateEnum
CREATE TYPE "TipoImovel" AS ENUM ('APARTAMENTO', 'CASA', 'CASA_CONDOMINIO', 'TERRENO', 'COMERCIAL', 'RURAL', 'COBERTURA', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusImovel" AS ENUM ('RASCUNHO', 'DISPONIVEL', 'RESERVADO', 'VENDIDO', 'ALUGADO', 'INATIVO');

-- CreateEnum
CREATE TYPE "TipoMidia" AS ENUM ('FOTO', 'VIDEO');

-- CreateEnum
CREATE TYPE "PapelPessoa" AS ENUM ('LEAD', 'CLIENTE', 'PROPRIETARIO');

-- CreateEnum
CREATE TYPE "OrigemLead" AS ENUM ('SITE', 'INDICACAO', 'PORTAL', 'INSTAGRAM', 'WHATSAPP', 'OUTRO');

-- CreateEnum
CREATE TYPE "EstagioFunil" AS ENUM ('NOVO_LEAD', 'CONTATO_FEITO', 'VISITA_AGENDADA', 'PROPOSTA', 'FECHADO', 'PERDIDO');

-- CreateEnum
CREATE TYPE "TipoNegocio" AS ENUM ('VENDA', 'LOCACAO');

-- CreateEnum
CREATE TYPE "TipoInteracao" AS ENUM ('VISITA', 'LIGACAO', 'MENSAGEM', 'EMAIL', 'OUTRO');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "senhaHash" TEXT NOT NULL,
    "papel" "PapelUsuario" NOT NULL DEFAULT 'CORRETOR',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pessoas" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefone" TEXT,
    "cpfCnpj" TEXT,
    "papeis" "PapelPessoa"[],
    "origem" "OrigemLead",
    "estagioFunil" "EstagioFunil" NOT NULL DEFAULT 'NOVO_LEAD',
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "corretorAtribuidoId" TEXT,

    CONSTRAINT "pessoas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imoveis" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" "TipoImovel" NOT NULL,
    "finalidade" "FinalidadeImovel" NOT NULL,
    "status" "StatusImovel" NOT NULL DEFAULT 'RASCUNHO',
    "cep" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "preco" DECIMAL(14,2),
    "precoCondominio" DECIMAL(14,2),
    "precoIptu" DECIMAL(14,2),
    "areaTotal" DOUBLE PRECISION,
    "areaPrivativa" DOUBLE PRECISION,
    "quartos" INTEGER,
    "suites" INTEGER,
    "banheiros" INTEGER,
    "vagasGaragem" INTEGER,
    "caracteristicas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "publicadoEm" TIMESTAMP(3),
    "corretorResponsavelId" TEXT,
    "proprietarioId" TEXT,

    CONSTRAINT "imoveis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "midias" (
    "id" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "tipo" "TipoMidia" NOT NULL,
    "url" TEXT NOT NULL,
    "ehCapa" BOOLEAN NOT NULL DEFAULT false,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "midias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_status_imoveis" (
    "id" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "statusAnterior" "StatusImovel",
    "statusNovo" "StatusImovel" NOT NULL,
    "alteradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historico_status_imoveis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interacoes" (
    "id" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,
    "imovelId" TEXT,
    "corretorId" TEXT,
    "tipo" "TipoInteracao" NOT NULL,
    "notas" TEXT,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "interacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negocios" (
    "id" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "corretorId" TEXT,
    "tipo" "TipoNegocio" NOT NULL,
    "valorFinal" DECIMAL(14,2) NOT NULL,
    "comissao" DECIMAL(14,2),
    "fechadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negocios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negocios_pessoas" (
    "negocioId" TEXT NOT NULL,
    "pessoaId" TEXT NOT NULL,

    CONSTRAINT "negocios_pessoas_pkey" PRIMARY KEY ("negocioId","pessoaId")
);

-- CreateTable
CREATE TABLE "publicacoes_portais" (
    "id" TEXT NOT NULL,
    "imovelId" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "idAnuncioExterno" TEXT,
    "ultimaSincronizacaoEm" TIMESTAMP(3),
    "ultimoErro" TEXT,

    CONSTRAINT "publicacoes_portais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "imoveis_status_idx" ON "imoveis"("status");

-- CreateIndex
CREATE INDEX "imoveis_cidade_bairro_idx" ON "imoveis"("cidade", "bairro");

-- CreateIndex
CREATE INDEX "imoveis_finalidade_tipo_idx" ON "imoveis"("finalidade", "tipo");

-- CreateIndex
CREATE INDEX "midias_imovelId_idx" ON "midias"("imovelId");

-- CreateIndex
CREATE INDEX "historico_status_imoveis_imovelId_idx" ON "historico_status_imoveis"("imovelId");

-- CreateIndex
CREATE INDEX "interacoes_pessoaId_idx" ON "interacoes"("pessoaId");

-- CreateIndex
CREATE INDEX "negocios_imovelId_idx" ON "negocios"("imovelId");

-- CreateIndex
CREATE UNIQUE INDEX "publicacoes_portais_imovelId_portal_key" ON "publicacoes_portais"("imovelId", "portal");

-- AddForeignKey
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_corretorAtribuidoId_fkey" FOREIGN KEY ("corretorAtribuidoId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imoveis" ADD CONSTRAINT "imoveis_corretorResponsavelId_fkey" FOREIGN KEY ("corretorResponsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imoveis" ADD CONSTRAINT "imoveis_proprietarioId_fkey" FOREIGN KEY ("proprietarioId") REFERENCES "pessoas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "midias" ADD CONSTRAINT "midias_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historico_status_imoveis" ADD CONSTRAINT "historico_status_imoveis_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interacoes" ADD CONSTRAINT "interacoes_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_corretorId_fkey" FOREIGN KEY ("corretorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negocios_pessoas" ADD CONSTRAINT "negocios_pessoas_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "negocios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "negocios_pessoas" ADD CONSTRAINT "negocios_pessoas_pessoaId_fkey" FOREIGN KEY ("pessoaId") REFERENCES "pessoas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publicacoes_portais" ADD CONSTRAINT "publicacoes_portais_imovelId_fkey" FOREIGN KEY ("imovelId") REFERENCES "imoveis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
