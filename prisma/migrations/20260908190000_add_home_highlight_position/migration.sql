-- =====================================================================
-- Vitrine editorial da Home (posição 1..4)
-- =====================================================================
-- PURAMENTE ADITIVA. Nenhuma coluna existente é alterada ou removida:
-- isLaunch, isFeatured e isOpportunity continuam intactos, porque
-- continuam alimentando o badge da ficha, o filtro público e o KPI do
-- painel — superfícies que não pediram mudança nenhuma.
--
-- A coluna nasce NULL para todo imóvel existente, de propósito: nenhuma
-- organização ganha vitrine automaticamente, e a seção simplesmente não
-- é renderizada até alguém escolher. Migrar os antigos "destaques" para
-- os quatro slots seria decidir editorialmente pelo cliente.
ALTER TABLE "properties" ADD COLUMN "homeHighlightPosition" INTEGER;

-- O índice único é a garantia ESTRUTURAL do teto de quatro: com as
-- posições restritas a 1..4 pela validação, o banco não aceita um
-- quinto na mesma organização. É também o que decide corridas — duas
-- requisições disputando a mesma posição terminam com uma violação de
-- unicidade, nunca com duas linhas.
--
-- Postgres permite múltiplos NULL num índice único, então todos os
-- imóveis fora da vitrine convivem sem colidir.
CREATE UNIQUE INDEX "properties_organizationId_homeHighlightPosition_key"
  ON "properties"("organizationId", "homeHighlightPosition");
