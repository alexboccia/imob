// Tipos e constantes client-safe da busca global (Fase 86) — mesmo motivo
// de src/components/admin/pipeline/prioridade-visual.ts: src/lib/busca-global.ts
// importa Prisma e não pode atravessar a fronteira Server -> Client
// (BuscaGlobal.tsx), então o formato do resultado e o mínimo de
// caracteres vivem aqui, sem nenhuma dependência de servidor.

export const LIMITE_POR_CATEGORIA = 5;
// Abaixo disso o ILIKE '%x%' de 1 caractere devolveria uma fração grande
// de qualquer tabela — sem valor de busca real e caro em toda tecla.
export const MINIMO_CARACTERES_BUSCA = 2;

export type ClienteBuscaGlobal = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

export type ImovelBuscaGlobal = {
  id: string;
  title: string;
  code: number;
  city: string;
  purpose: string;
  status: string;
  price: number | null;
  rentPrice: number | null;
};

export type ResultadoBuscaGlobal = {
  termo: string;
  clientes: ClienteBuscaGlobal[];
  imoveis: ImovelBuscaGlobal[];
  // Fase 87 — o atalho "Ver clientes" de um resultado de imóvel aponta
  // pra uma seção que só existe na ficha quando o CRM está habilitado
  // (mesmo portão de módulo que já filtra `clientes` acima). Já é
  // calculado em buscarGlobal (hasModule) pra decidir se busca clientes
  // — reaproveitado aqui, nenhuma consulta nova.
  crmHabilitado: boolean;
};
