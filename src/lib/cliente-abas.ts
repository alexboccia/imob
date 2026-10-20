import { User, SlidersHorizontal, Building2, History } from "lucide-react";

// Redesenho da ficha do cliente — as 4 abas (Visão geral/Preferências/
// Imóveis/Histórico), num módulo plano (sem "use client") para que tanto
// a página (Server Component, lê o searchParam inicial) quanto o
// controlador client (ClienteAbas) importem a MESMA lista, nunca duas
// definições que podem divergir.
export const ABAS_CLIENTE = [
  { valor: "visao-geral", rotulo: "Visão geral", icone: User },
  { valor: "preferencias", rotulo: "Preferências", icone: SlidersHorizontal },
  { valor: "imoveis", rotulo: "Imóveis", icone: Building2 },
  { valor: "historico", rotulo: "Histórico", icone: History },
] as const;

export type AbaCliente = (typeof ABAS_CLIENTE)[number]["valor"];

const VALORES_VALIDOS = new Set<string>(ABAS_CLIENTE.map((a) => a.valor));

// "visao-geral" é o padrão ao carregar a ficha — tanto quando não há
// `?aba=` na URL quanto quando o valor não corresponde a nenhuma aba
// real (link antigo, digitado à mão, etc.).
export function abaClienteValida(valor: string | undefined | null): AbaCliente {
  return valor && VALORES_VALIDOS.has(valor) ? (valor as AbaCliente) : "visao-geral";
}
