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

// Estado interno de um campo de moeda mascarado (ex: CampoMoeda,
// FiltrosImoveis) é a string de dígitos em centavos, nunca o número
// float direto — evita os bugs de arredondamento clássicos de máscara
// de moeda digitada da direita pra esquerda.
export function paraDigitosMoeda(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const numero = Number(valor);
  if (Number.isNaN(numero)) return "";
  return String(Math.round(numero * 100));
}

export function formatarExibicaoMoeda(digitos: string): string {
  if (!digitos) return "";
  const numero = Number(digitos) / 100;
  return numero.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
  PRE_CONSTRUCTION: "Na planta",
  UNDER_CONSTRUCTION: "Em construção",
  READY_TO_MOVE: "Pronto para morar",
};

export const FINALIDADE_LABEL: Record<string, string> = {
  SALE: "Comprar",
  RENT: "Alugar",
  SALE_AND_RENT: "Comprar ou Alugar",
};

export const STATUS_IMOVEL_LABEL: Record<string, string> = {
  DRAFT: "Rascunho",
  AVAILABLE: "Disponível",
  RESERVED: "Reservado",
  SOLD: "Vendido",
  RENTED: "Alugado",
  INACTIVE: "Inativo",
};

export const PAPEL_USUARIO_LABEL: Record<string, string> = {
  OWNER: "Proprietário",
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  BROKER: "Corretor",
  ASSISTANT: "Assistente",
};

export const ROTULOS_IMOVEL = [
  {
    chave: "lancamento",
    label: "Lançamento",
    className: "bg-label-launch text-label-launch-foreground",
  },
  {
    chave: "destaque",
    label: "Destaque",
    className: "bg-label-featured text-label-featured-foreground",
  },
  {
    chave: "oportunidade",
    label: "Oportunidade",
    className: "bg-label-opportunity text-label-opportunity-foreground",
  },
] as const;

export function rotulosAtivos(imovel: {
  lancamento: boolean;
  destaque: boolean;
  oportunidade: boolean;
}) {
  return ROTULOS_IMOVEL.filter((r) => imovel[r.chave]);
}
