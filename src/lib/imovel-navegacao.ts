import {
  House,
  Megaphone,
  MapPin,
  CircleDollarSign,
  Ruler,
  ListChecks,
  Images,
} from "lucide-react";

// Redesign da tela de edição de imóvel — as 7 seções da navegação
// horizontal (item 6.1 da autorização), num módulo plano (sem "use
// client") para que a página (Server Component) e a barra de navegação
// (client) importem a MESMA lista. Os `id` batem com o `id` de cada
// <section> em ImovelForm.tsx — nunca strings soltas duplicadas nos
// dois lugares.
export const SECOES_IMOVEL = [
  { id: "secao-identificacao", rotulo: "Identificação", icone: House },
  { id: "secao-divulgacao", rotulo: "Divulgação", icone: Megaphone },
  { id: "secao-endereco", rotulo: "Endereço", icone: MapPin },
  { id: "secao-valores", rotulo: "Valores", icone: CircleDollarSign },
  { id: "secao-medidas", rotulo: "Medidas e cômodos", icone: Ruler },
  { id: "secao-caracteristicas", rotulo: "Características", icone: ListChecks },
  // "Materiais de apresentação" e "O que tem por perto" continuam
  // montadas logo depois desta seção (nenhum campo/seção foi removido),
  // só não ganharam item próprio na barra — a autorização especificou
  // exatamente estes 7 nomes, nem mais nem menos.
  { id: "secao-fotos", rotulo: "Fotos e mídia", icone: Images },
] as const;

export type SecaoImovelId = (typeof SECOES_IMOVEL)[number]["id"];
