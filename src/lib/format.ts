export function formatarCodigoImovel(
  codigo: number,
  prefixo?: string | null
) {
  return prefixo ? `${prefixo}-${codigo}` : `${codigo}`;
}

export function formatarPreco(valor: unknown) {
  if (valor === null || valor === undefined) return "Consulte-nos";
  const numero = Number(valor.toString());
  if (Number.isNaN(numero)) return "Consulte-nos";
  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function formatarTempoRelativo(data: Date) {
  const segundos = Math.max(0, (Date.now() - data.getTime()) / 1000);

  if (segundos < 3600) {
    const minutos = Math.max(1, Math.floor(segundos / 60));
    return `há ${minutos} minuto${minutos === 1 ? "" : "s"}`;
  }
  if (segundos < 86400) {
    const horas = Math.floor(segundos / 3600);
    return `há ${horas} hora${horas === 1 ? "" : "s"}`;
  }
  const dias = Math.floor(segundos / 86400);
  return `há ${dias} dia${dias === 1 ? "" : "s"}`;
}

const MESES_ABREV = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];

export function formatarMesAno(data: Date) {
  const mes = MESES_ABREV[data.getUTCMonth()];
  const ano = String(data.getUTCFullYear()).slice(-2);
  return `${mes}/${ano}`;
}

export const ESTAGIO_OBRA_LABEL: Record<string, string> = {
  NA_PLANTA: "Na planta",
  EM_CONSTRUCAO: "Em construção",
  PRONTO_PARA_MORAR: "Pronto para morar",
};

export const TIPO_IMOVEL_LABEL: Record<string, string> = {
  APARTAMENTO: "Apartamento",
  CASA: "Casa",
  CASA_CONDOMINIO: "Casa em condomínio",
  TERRENO: "Terreno",
  COMERCIAL: "Comercial",
  RURAL: "Rural",
  COBERTURA: "Cobertura",
  OUTRO: "Outro",
};

export const FINALIDADE_LABEL: Record<string, string> = {
  VENDA: "Comprar",
  ALUGUEL: "Alugar",
  VENDA_E_ALUGUEL: "Comprar ou Alugar",
};

export const STATUS_IMOVEL_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  DISPONIVEL: "Disponível",
  RESERVADO: "Reservado",
  VENDIDO: "Vendido",
  ALUGADO: "Alugado",
  INATIVO: "Inativo",
};

export const ROTULOS_IMOVEL = [
  { chave: "lancamento", label: "Lançamento", className: "bg-black text-white" },
  { chave: "destaque", label: "Destaque", className: "bg-blue-600 text-white" },
  {
    chave: "oportunidade",
    label: "Oportunidade",
    className: "bg-orange-500 text-white",
  },
] as const;

export function rotulosAtivos(imovel: {
  lancamento: boolean;
  destaque: boolean;
  oportunidade: boolean;
}) {
  return ROTULOS_IMOVEL.filter((r) => imovel[r.chave]);
}
