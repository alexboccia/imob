-- AlterTable
ALTER TABLE "people" ADD COLUMN     "emailNormalized" TEXT,
ADD COLUMN     "phoneNormalized" TEXT;

-- Backfill condicional, em duas camadas:
-- 1) NULLIF(..., '') garante que um valor que normaliza pra string vazia
--    (telefone sem nenhum dígito, e-mail só com espaços) nunca vira
--    identidade válida — fica NULL, nunca "". Sem isso, toda Person com
--    contato "sujo" colidiria entre si na unique constraint (string vazia
--    é um valor real pra fins de unicidade, diferente de NULL).
-- 2) Onde o valor normalizado (já sem considerar strings vazias) colide
--    com outra Person na mesma organização (duplicata histórica de antes
--    desta migration), o campo fica NULL pro grupo inteiro — nenhuma das
--    duas é escolhida arbitrariamente, nenhum dado original é alterado ou
--    perdido, só não participam da deduplicação automática (ver
--    src/lib/person-dedup.ts).
-- GROUP BY/HAVING + anti-join em vez de subquery correlacionada por
-- linha — evita custo quadrático numa tabela grande; ainda é migration
-- (roda uma vez), mas não custa ser eficiente.
WITH duplicados_email AS (
  SELECT "organizationId", NULLIF(lower(trim("email")), '') AS norm
  FROM "people"
  WHERE NULLIF(lower(trim("email")), '') IS NOT NULL
  GROUP BY "organizationId", NULLIF(lower(trim("email")), '')
  HAVING count(*) > 1
)
UPDATE "people" p
SET "emailNormalized" = NULLIF(lower(trim(p."email")), '')
WHERE NULLIF(lower(trim(p."email")), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM duplicados_email d
    WHERE d."organizationId" = p."organizationId" AND d.norm = NULLIF(lower(trim(p."email")), '')
  );

WITH duplicados_telefone AS (
  SELECT "organizationId", NULLIF(regexp_replace("phone", '\D', '', 'g'), '') AS norm
  FROM "people"
  WHERE NULLIF(regexp_replace("phone", '\D', '', 'g'), '') IS NOT NULL
  GROUP BY "organizationId", NULLIF(regexp_replace("phone", '\D', '', 'g'), '')
  HAVING count(*) > 1
)
UPDATE "people" p
SET "phoneNormalized" = NULLIF(regexp_replace(p."phone", '\D', '', 'g'), '')
WHERE NULLIF(regexp_replace(p."phone", '\D', '', 'g'), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM duplicados_telefone d
    WHERE d."organizationId" = p."organizationId" AND d.norm = NULLIF(regexp_replace(p."phone", '\D', '', 'g'), '')
  );

-- CreateIndex
-- Só pode suceder porque o backfill acima já garantiu que não sobra
-- nenhum valor duplicado (nem string vazia) populado dentro da mesma
-- organização.
CREATE UNIQUE INDEX "people_organizationId_emailNormalized_key" ON "people"("organizationId", "emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "people_organizationId_phoneNormalized_key" ON "people"("organizationId", "phoneNormalized");
