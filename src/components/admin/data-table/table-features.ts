import { tableFeatures } from "@tanstack/react-table";

// Paginação, ordenação e busca agora acontecem no servidor (Prisma/
// PostgreSQL) — a tabela só precisa saber renderizar colunas/linhas da
// página atual, sem nenhuma feature de processamento client-side.
export const tableFeaturesUsadas = tableFeatures({});

export type TableFeaturesUsadas = typeof tableFeaturesUsadas;
