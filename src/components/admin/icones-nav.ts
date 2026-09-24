import {
  Building,
  Building2,
  Calendar,
  ChartNoAxesCombined,
  ClipboardList,
  Contact,
  CreditCard,
  Funnel,
  LayoutDashboard,
  Settings,
  SlidersHorizontal,
  Tags,
  UserRound,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";

// Ícones do menu administrativo (Fase 62).
//
// O mapa é indexado por CHAVE DE STRING, não pelo componente: a lista de
// navegação vive em src/app/app/layout.tsx (Server Component) e é
// serializada para a sidebar e para o menu mobile, que são componentes de
// cliente. Uma função-componente não atravessa essa fronteira; uma string
// atravessa. É também o que mantém desktop e mobile com o MESMO ícone por
// item, sem duas listas para sincronizar à mão.
//
// A chave é só um apelido visual — nunca um href, um papel ou um módulo.
// Trocar o ícone de um item é trocar a chave aqui; nada na autorização,
// nas rotas ou nas condições de visibilidade depende deste arquivo.
export type ChaveIconeNav =
  | "dashboard"
  | "imoveis"
  | "clientes"
  | "pipeline"
  | "agenda"
  | "analytics"
  | "comissoes"
  | "captacoes"
  | "empreendimentos"
  | "caracteristicas"
  | "tipos-imovel"
  | "usuarios"
  | "meu-perfil"
  | "configuracoes"
  | "assinatura"
  | "manutencao";

export const ICONES_NAV: Record<ChaveIconeNav, LucideIcon> = {
  dashboard: LayoutDashboard,
  imoveis: Building2,
  // Contact (cartão de contato) em vez de Users: separa visualmente a
  // carteira de CLIENTES da tela de USUÁRIOS da imobiliária, que é a que
  // fica com o ícone de pessoas.
  clientes: Contact,
  pipeline: Funnel,
  agenda: Calendar,
  analytics: ChartNoAxesCombined,
  comissoes: Wallet,
  captacoes: ClipboardList,
  // Building (um prédio) para empreendimentos e Building2 (conjunto) para
  // imóveis: são telas vizinhas e o ícone precisa distingui-las.
  empreendimentos: Building,
  caracteristicas: SlidersHorizontal,
  "tipos-imovel": Tags,
  usuarios: Users,
  "meu-perfil": UserRound,
  configuracoes: Settings,
  assinatura: CreditCard,
  manutencao: Wrench,
};
