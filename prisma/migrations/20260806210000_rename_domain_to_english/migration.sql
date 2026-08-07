-- Fase 2 do plano multi-tenant (EasyMob): renomeia todo o domínio para
-- inglês e liga o isolamento por organização. Todas as operações de
-- RENAME abaixo são metadata-only no Postgres (não reescrevem dados).
-- As tabelas/enum "usuarios", "configuracao_contato" e "PapelUsuario"
-- ficam órfãs, propositalmente preservadas como histórico morto (já
-- substituídas por "users"/"organization_members" e
-- "organization_settings" na Fase 1).

-- ===================== 1. Renomear enums =====================

ALTER TYPE "EstagioObra" RENAME TO "ConstructionStage";
ALTER TYPE "ConstructionStage" RENAME VALUE 'NA_PLANTA' TO 'PRE_CONSTRUCTION';
ALTER TYPE "ConstructionStage" RENAME VALUE 'EM_CONSTRUCAO' TO 'UNDER_CONSTRUCTION';
ALTER TYPE "ConstructionStage" RENAME VALUE 'PRONTO_PARA_MORAR' TO 'READY_TO_MOVE';

ALTER TYPE "FinalidadeImovel" RENAME TO "PropertyPurpose";
ALTER TYPE "PropertyPurpose" RENAME VALUE 'VENDA' TO 'SALE';
ALTER TYPE "PropertyPurpose" RENAME VALUE 'ALUGUEL' TO 'RENT';
ALTER TYPE "PropertyPurpose" RENAME VALUE 'VENDA_E_ALUGUEL' TO 'SALE_AND_RENT';

ALTER TYPE "CategoriaTipoImovel" RENAME TO "PropertyTypeCategory";
ALTER TYPE "PropertyTypeCategory" RENAME VALUE 'RESIDENCIAL' TO 'RESIDENTIAL';
ALTER TYPE "PropertyTypeCategory" RENAME VALUE 'COMERCIAL' TO 'COMMERCIAL';

ALTER TYPE "StatusImovel" RENAME TO "PropertyStatus";
ALTER TYPE "PropertyStatus" RENAME VALUE 'RASCUNHO' TO 'DRAFT';
ALTER TYPE "PropertyStatus" RENAME VALUE 'DISPONIVEL' TO 'AVAILABLE';
ALTER TYPE "PropertyStatus" RENAME VALUE 'RESERVADO' TO 'RESERVED';
ALTER TYPE "PropertyStatus" RENAME VALUE 'VENDIDO' TO 'SOLD';
ALTER TYPE "PropertyStatus" RENAME VALUE 'ALUGADO' TO 'RENTED';
ALTER TYPE "PropertyStatus" RENAME VALUE 'INATIVO' TO 'INACTIVE';

ALTER TYPE "TipoMidia" RENAME TO "MediaType";
ALTER TYPE "MediaType" RENAME VALUE 'FOTO' TO 'PHOTO';
ALTER TYPE "MediaType" RENAME VALUE 'PLANTA' TO 'FLOOR_PLAN';

ALTER TYPE "PapelPessoa" RENAME TO "PersonRole";
ALTER TYPE "PersonRole" RENAME VALUE 'CLIENTE' TO 'CLIENT';
ALTER TYPE "PersonRole" RENAME VALUE 'PROPRIETARIO' TO 'OWNER';

ALTER TYPE "OrigemLead" RENAME TO "LeadSource";
ALTER TYPE "LeadSource" RENAME VALUE 'SITE' TO 'WEBSITE';
ALTER TYPE "LeadSource" RENAME VALUE 'INDICACAO' TO 'REFERRAL';
ALTER TYPE "LeadSource" RENAME VALUE 'OUTRO' TO 'OTHER';

ALTER TYPE "EstagioFunil" RENAME TO "PipelineStage";
ALTER TYPE "PipelineStage" RENAME VALUE 'NOVO_LEAD' TO 'NEW_LEAD';
ALTER TYPE "PipelineStage" RENAME VALUE 'CONTATO_FEITO' TO 'CONTACTED';
ALTER TYPE "PipelineStage" RENAME VALUE 'VISITA_AGENDADA' TO 'VISIT_SCHEDULED';
ALTER TYPE "PipelineStage" RENAME VALUE 'PROPOSTA' TO 'PROPOSAL';
ALTER TYPE "PipelineStage" RENAME VALUE 'FECHADO' TO 'CLOSED';
ALTER TYPE "PipelineStage" RENAME VALUE 'PERDIDO' TO 'LOST';

ALTER TYPE "TipoNegocio" RENAME TO "DealType";
ALTER TYPE "DealType" RENAME VALUE 'VENDA' TO 'SALE';
ALTER TYPE "DealType" RENAME VALUE 'LOCACAO' TO 'LEASE';

ALTER TYPE "CategoriaCaracteristica" RENAME TO "FeatureCategory";
ALTER TYPE "FeatureCategory" RENAME VALUE 'IMOVEL' TO 'PROPERTY';
ALTER TYPE "FeatureCategory" RENAME VALUE 'CONDOMINIO' TO 'CONDO';

ALTER TYPE "TipoInteracao" RENAME TO "InteractionType";
ALTER TYPE "InteractionType" RENAME VALUE 'VISITA' TO 'VISIT';
ALTER TYPE "InteractionType" RENAME VALUE 'LIGACAO' TO 'CALL';
ALTER TYPE "InteractionType" RENAME VALUE 'MENSAGEM' TO 'MESSAGE';
ALTER TYPE "InteractionType" RENAME VALUE 'OUTRO' TO 'OTHER';

-- ===================== 2. Renomear tabelas =====================

ALTER TABLE "pessoas" RENAME TO "people";
ALTER TABLE "imoveis" RENAME TO "properties";
ALTER TABLE "midias" RENAME TO "media";
ALTER TABLE "historico_status_imoveis" RENAME TO "property_status_history";
ALTER TABLE "interacoes" RENAME TO "interactions";
ALTER TABLE "negocios" RENAME TO "deals";
ALTER TABLE "negocios_pessoas" RENAME TO "deal_people";
ALTER TABLE "publicacoes_portais" RENAME TO "portal_listings";
ALTER TABLE "caracteristicas_opcoes" RENAME TO "feature_options";
ALTER TABLE "tipos_imovel_opcoes" RENAME TO "property_type_options";

ALTER SEQUENCE "imoveis_codigo_seq" RENAME TO "properties_code_seq";

-- ===================== 3. Renomear colunas =====================

ALTER TABLE "people" RENAME COLUMN "nome" TO "name";
ALTER TABLE "people" RENAME COLUMN "telefone" TO "phone";
ALTER TABLE "people" RENAME COLUMN "cpfCnpj" TO "taxId";
ALTER TABLE "people" RENAME COLUMN "papeis" TO "roles";
ALTER TABLE "people" RENAME COLUMN "origem" TO "source";
ALTER TABLE "people" RENAME COLUMN "estagioFunil" TO "pipelineStage";
ALTER TABLE "people" RENAME COLUMN "observacoes" TO "notes";
ALTER TABLE "people" RENAME COLUMN "criadoEm" TO "createdAt";
ALTER TABLE "people" RENAME COLUMN "atualizadoEm" TO "updatedAt";

ALTER TABLE "properties" RENAME COLUMN "codigo" TO "code";
ALTER TABLE "properties" RENAME COLUMN "titulo" TO "title";
ALTER TABLE "properties" RENAME COLUMN "descricao" TO "description";
ALTER TABLE "properties" RENAME COLUMN "tipo" TO "type";
ALTER TABLE "properties" RENAME COLUMN "finalidade" TO "purpose";
ALTER TABLE "properties" RENAME COLUMN "lancamento" TO "isLaunch";
ALTER TABLE "properties" RENAME COLUMN "destaque" TO "isFeatured";
ALTER TABLE "properties" RENAME COLUMN "oportunidade" TO "isOpportunity";
ALTER TABLE "properties" RENAME COLUMN "slideshow" TO "hasSlideshow";
ALTER TABLE "properties" RENAME COLUMN "estagioObra" TO "constructionStage";
ALTER TABLE "properties" RENAME COLUMN "previsaoEntrega" TO "deliveryForecast";
ALTER TABLE "properties" RENAME COLUMN "construtora" TO "developer";
ALTER TABLE "properties" RENAME COLUMN "cep" TO "zipCode";
ALTER TABLE "properties" RENAME COLUMN "logradouro" TO "street";
ALTER TABLE "properties" RENAME COLUMN "numero" TO "number";
ALTER TABLE "properties" RENAME COLUMN "complemento" TO "complement";
ALTER TABLE "properties" RENAME COLUMN "bairro" TO "neighborhood";
ALTER TABLE "properties" RENAME COLUMN "cidade" TO "city";
ALTER TABLE "properties" RENAME COLUMN "estado" TO "state";
ALTER TABLE "properties" RENAME COLUMN "preco" TO "price";
ALTER TABLE "properties" RENAME COLUMN "precoAluguel" TO "rentPrice";
ALTER TABLE "properties" RENAME COLUMN "precoCondominio" TO "condoFee";
ALTER TABLE "properties" RENAME COLUMN "precoIptu" TO "propertyTax";
ALTER TABLE "properties" RENAME COLUMN "areaTotal" TO "totalArea";
ALTER TABLE "properties" RENAME COLUMN "areaPrivativa" TO "privateArea";
ALTER TABLE "properties" RENAME COLUMN "quartos" TO "bedrooms";
ALTER TABLE "properties" RENAME COLUMN "banheiros" TO "bathrooms";
ALTER TABLE "properties" RENAME COLUMN "vagasGaragem" TO "parkingSpots";
ALTER TABLE "properties" RENAME COLUMN "caracteristicasImovel" TO "propertyFeatures";
ALTER TABLE "properties" RENAME COLUMN "caracteristicasCondominio" TO "condoFeatures";
ALTER TABLE "properties" RENAME COLUMN "criadoEm" TO "createdAt";
ALTER TABLE "properties" RENAME COLUMN "atualizadoEm" TO "updatedAt";
ALTER TABLE "properties" RENAME COLUMN "publicadoEm" TO "publishedAt";
ALTER TABLE "properties" RENAME COLUMN "proprietarioId" TO "ownerId";

ALTER TABLE "media" RENAME COLUMN "imovelId" TO "propertyId";
ALTER TABLE "media" RENAME COLUMN "tipo" TO "type";
ALTER TABLE "media" RENAME COLUMN "ehCapa" TO "isCover";
ALTER TABLE "media" RENAME COLUMN "ordem" TO "order";
ALTER TABLE "media" RENAME COLUMN "criadoEm" TO "createdAt";

ALTER TABLE "property_status_history" RENAME COLUMN "imovelId" TO "propertyId";
ALTER TABLE "property_status_history" RENAME COLUMN "statusAnterior" TO "previousStatus";
ALTER TABLE "property_status_history" RENAME COLUMN "statusNovo" TO "newStatus";
ALTER TABLE "property_status_history" RENAME COLUMN "alteradoEm" TO "changedAt";

ALTER TABLE "interactions" RENAME COLUMN "pessoaId" TO "personId";
ALTER TABLE "interactions" RENAME COLUMN "imovelId" TO "propertyId";
ALTER TABLE "interactions" RENAME COLUMN "tipo" TO "type";
ALTER TABLE "interactions" RENAME COLUMN "notas" TO "notes";
ALTER TABLE "interactions" RENAME COLUMN "dataHora" TO "occurredAt";

ALTER TABLE "deals" RENAME COLUMN "imovelId" TO "propertyId";
ALTER TABLE "deals" RENAME COLUMN "tipo" TO "type";
ALTER TABLE "deals" RENAME COLUMN "valorFinal" TO "finalValue";
ALTER TABLE "deals" RENAME COLUMN "comissao" TO "commission";
ALTER TABLE "deals" RENAME COLUMN "fechadoEm" TO "closedAt";

ALTER TABLE "deal_people" RENAME COLUMN "negocioId" TO "dealId";
ALTER TABLE "deal_people" RENAME COLUMN "pessoaId" TO "personId";

ALTER TABLE "portal_listings" RENAME COLUMN "imovelId" TO "propertyId";
ALTER TABLE "portal_listings" RENAME COLUMN "idAnuncioExterno" TO "externalListingId";
ALTER TABLE "portal_listings" RENAME COLUMN "ultimaSincronizacaoEm" TO "lastSyncedAt";
ALTER TABLE "portal_listings" RENAME COLUMN "ultimoErro" TO "lastError";

ALTER TABLE "feature_options" RENAME COLUMN "nome" TO "name";
ALTER TABLE "feature_options" RENAME COLUMN "categoria" TO "category";
ALTER TABLE "feature_options" RENAME COLUMN "criadoEm" TO "createdAt";

ALTER TABLE "property_type_options" RENAME COLUMN "nome" TO "name";
ALTER TABLE "property_type_options" RENAME COLUMN "categoria" TO "category";
ALTER TABLE "property_type_options" RENAME COLUMN "criadoEm" TO "createdAt";

-- ===================== 4. Novas colunas (organizationId + *MemberId) =====================

ALTER TABLE "people" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "people" ADD COLUMN "assignedMemberId" TEXT;

ALTER TABLE "properties" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "properties" ADD COLUMN "responsibleMemberId" TEXT;

ALTER TABLE "media" ADD COLUMN "organizationId" TEXT;

ALTER TABLE "property_status_history" ADD COLUMN "organizationId" TEXT;

ALTER TABLE "interactions" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "interactions" ADD COLUMN "memberId" TEXT;

ALTER TABLE "deals" ADD COLUMN "organizationId" TEXT;
ALTER TABLE "deals" ADD COLUMN "memberId" TEXT;

ALTER TABLE "portal_listings" ADD COLUMN "organizationId" TEXT;

ALTER TABLE "feature_options" ADD COLUMN "organizationId" TEXT;

ALTER TABLE "property_type_options" ADD COLUMN "organizationId" TEXT;

-- ===================== 5. Backfill: *MemberId a partir do Usuario legado =====================
-- Junta pela tabela "usuarios" (legado, viva) -> "users" (Fase 1, mesmo e-mail)
-- -> "organization_members" (Fase 1) para descobrir o membership correto.

UPDATE "people" p
SET "assignedMemberId" = om.id
FROM "usuarios" u
JOIN "users" nu ON nu.email = u.email
JOIN "organization_members" om ON om."userId" = nu.id
WHERE p."corretorAtribuidoId" = u.id;

UPDATE "properties" pr
SET "responsibleMemberId" = om.id
FROM "usuarios" u
JOIN "users" nu ON nu.email = u.email
JOIN "organization_members" om ON om."userId" = nu.id
WHERE pr."corretorResponsavelId" = u.id;

UPDATE "interactions" i
SET "memberId" = om.id
FROM "usuarios" u
JOIN "users" nu ON nu.email = u.email
JOIN "organization_members" om ON om."userId" = nu.id
WHERE i."corretorId" = u.id;

UPDATE "deals" d
SET "memberId" = om.id
FROM "usuarios" u
JOIN "users" nu ON nu.email = u.email
JOIN "organization_members" om ON om."userId" = nu.id
WHERE d."corretorId" = u.id;

-- ===================== 6. Backfill: organizationId para o tenant único existente =====================

UPDATE "people" SET "organizationId" = (SELECT id FROM "organizations" WHERE slug = 'boccia') WHERE "organizationId" IS NULL;
UPDATE "properties" SET "organizationId" = (SELECT id FROM "organizations" WHERE slug = 'boccia') WHERE "organizationId" IS NULL;
UPDATE "media" SET "organizationId" = (SELECT id FROM "organizations" WHERE slug = 'boccia') WHERE "organizationId" IS NULL;
UPDATE "property_status_history" SET "organizationId" = (SELECT id FROM "organizations" WHERE slug = 'boccia') WHERE "organizationId" IS NULL;
UPDATE "interactions" SET "organizationId" = (SELECT id FROM "organizations" WHERE slug = 'boccia') WHERE "organizationId" IS NULL;
UPDATE "deals" SET "organizationId" = (SELECT id FROM "organizations" WHERE slug = 'boccia') WHERE "organizationId" IS NULL;
UPDATE "portal_listings" SET "organizationId" = (SELECT id FROM "organizations" WHERE slug = 'boccia') WHERE "organizationId" IS NULL;
UPDATE "feature_options" SET "organizationId" = (SELECT id FROM "organizations" WHERE slug = 'boccia') WHERE "organizationId" IS NULL;
UPDATE "property_type_options" SET "organizationId" = (SELECT id FROM "organizations" WHERE slug = 'boccia') WHERE "organizationId" IS NULL;

-- ===================== 7. NOT NULL + Foreign Keys =====================

ALTER TABLE "people" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "people" ADD CONSTRAINT "people_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "people" ADD CONSTRAINT "people_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "properties" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "properties" ADD CONSTRAINT "properties_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "properties" ADD CONSTRAINT "properties_responsibleMemberId_fkey" FOREIGN KEY ("responsibleMemberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "media" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "media" ADD CONSTRAINT "media_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "property_status_history" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "property_status_history" ADD CONSTRAINT "property_status_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "interactions" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deals" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "deals" ADD CONSTRAINT "deals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "deals" ADD CONSTRAINT "deals_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "organization_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "portal_listings" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "portal_listings" ADD CONSTRAINT "portal_listings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "feature_options" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "feature_options" ADD CONSTRAINT "feature_options_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "property_type_options" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "property_type_options" ADD CONSTRAINT "property_type_options_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ===================== 8. Remover colunas/constraints legadas de corretor* =====================

ALTER TABLE "people" DROP CONSTRAINT IF EXISTS "pessoas_corretorAtribuidoId_fkey";
ALTER TABLE "people" DROP COLUMN "corretorAtribuidoId";

ALTER TABLE "properties" DROP CONSTRAINT IF EXISTS "imoveis_corretorResponsavelId_fkey";
ALTER TABLE "properties" DROP COLUMN "corretorResponsavelId";

ALTER TABLE "interactions" DROP CONSTRAINT IF EXISTS "interacoes_corretorId_fkey";
ALTER TABLE "interactions" DROP COLUMN "corretorId";

ALTER TABLE "deals" DROP CONSTRAINT IF EXISTS "negocios_corretorId_fkey";
ALTER TABLE "deals" DROP COLUMN "corretorId";

-- ===================== 9. Unique constraints por tenant =====================

ALTER TABLE "properties" DROP CONSTRAINT IF EXISTS "imoveis_codigo_key";
ALTER TABLE "properties" ADD CONSTRAINT "properties_organizationId_code_key" UNIQUE ("organizationId", "code");

ALTER TABLE "feature_options" DROP CONSTRAINT IF EXISTS "caracteristicas_opcoes_categoria_nome_key";
ALTER TABLE "feature_options" ADD CONSTRAINT "feature_options_organizationId_category_name_key" UNIQUE ("organizationId", "category", "name");

ALTER TABLE "property_type_options" DROP CONSTRAINT IF EXISTS "tipos_imovel_opcoes_categoria_nome_key";
ALTER TABLE "property_type_options" ADD CONSTRAINT "property_type_options_organizationId_category_name_key" UNIQUE ("organizationId", "category", "name");

-- ===================== 10. Índices compostos por tenant =====================

DROP INDEX IF EXISTS "imoveis_status_idx";
DROP INDEX IF EXISTS "imoveis_cidade_bairro_idx";
DROP INDEX IF EXISTS "imoveis_finalidade_tipo_idx";
DROP INDEX IF EXISTS "imoveis_lancamento_idx";

CREATE INDEX "properties_organizationId_status_idx" ON "properties"("organizationId", "status");
CREATE INDEX "properties_organizationId_city_neighborhood_idx" ON "properties"("organizationId", "city", "neighborhood");
CREATE INDEX "properties_organizationId_purpose_type_idx" ON "properties"("organizationId", "purpose", "type");
CREATE INDEX "properties_organizationId_isLaunch_idx" ON "properties"("organizationId", "isLaunch");

CREATE INDEX "people_organizationId_idx" ON "people"("organizationId");
