-- Índices GIN para os únicos campos array realmente filtrados por
-- containment (`has`/`hasSome`) no código hoje:
--   - people.roles          -> src/app/app/page.tsx (dashboard)
--   - properties.propertyFeatures / properties.condoFeatures
--       -> src/app/(public)/imoveis/page.tsx (busca pública)
--       -> src/lib/filtros-imoveis-data.ts (cálculo de facetas)
--
-- Índice B-tree comum (o que já existe via @@index normal) não serve pra
-- containment de array — só GIN. Nenhum outro campo array do schema
-- (ex: nenhum, os únicos arrays no domínio são estes três) é filtrado
-- dessa forma, então nenhum índice adicional foi criado sem uso real.
--
-- CREATE INDEX simples (não CONCURRENTLY): os volumes de dados atuais
-- (produção com poucas dezenas de linhas) tornam o lock breve da criação
-- irrelevante. Se as tabelas crescerem muito antes desta migration
-- rodar, considere recriar com CONCURRENTLY fora de uma transação.

-- CreateIndex
CREATE INDEX "people_roles_idx" ON "people" USING GIN ("roles");

-- CreateIndex
CREATE INDEX "properties_propertyFeatures_idx" ON "properties" USING GIN ("propertyFeatures");

-- CreateIndex
CREATE INDEX "properties_condoFeatures_idx" ON "properties" USING GIN ("condoFeatures");
