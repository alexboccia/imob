import { linkWhatsApp, temWhatsApp } from "@/lib/whatsapp";

// =======================================================================
// Contatos institucionais e redes sociais do site público (Fase 58)
// =======================================================================
// FONTE ÚNICA. Cabeçalho e rodapé consomem ESTE módulo, nunca os campos
// soltos de OrganizationSettings — é isso que impede o produto de acabar
// com um "instagram do topo" diferente do "instagram do rodapé". Cada
// canal tem UM valor e DUAS decisões de exibição.
//
// O QUE É, E O QUE NÃO É: aqui mora o contato da IMOBILIÁRIA. O contato
// público do CORRETOR é outro domínio (PerfilPublicoCorretor, member.
// publicProfile*) e continua intocado — são duas identidades diferentes
// e nunca devem cair na mesma caixa.
//
// NENHUM CAMPO DE CONTATO É NOVO: telefone, WhatsApp, Instagram,
// Facebook, YouTube e LinkedIn já existiam em OrganizationSettings e já
// alimentavam o rodapé e a Home. O que a Fase 58 acrescenta é (a) TikTok,
// que faltava no conjunto, e (b) a decisão de ONDE cada um aparece.

// -----------------------------------------------------------------------
// Horário de atendimento (Fase 58.2)
// -----------------------------------------------------------------------
// Fica NESTE módulo, junto dos canais, porque compartilha exatamente a
// mesma regra de exibição — e deliberadamente FORA de CANAIS_PUBLICOS,
// porque não é um destino: não tem href, não é clicável, não tem ícone
// de marca. É uma frase.
//
// 120 caracteres: a barra superior é uma linha só, dividida com redes,
// telefone e WhatsApp. "Atendimento de segunda a sábado, das 8h às 18h"
// tem 47; o dobro disso ainda cabe, e o triplo empurraria o resto para
// fora da linha em telas médias.
export const LIMITE_HORARIO_ATENDIMENTO = 120;

/** Onde uma informação pode ser exibida no site público. */
export type LocalExibicao = "topo" | "rodape";

export type ConfiguracaoHorario = { valor: string; topo: boolean; rodape: boolean };

/**
 * Normaliza o horário para gravar: apara, colapsa espaços e devolve null
 * para vazio — nunca "" (que o site teria de tratar como preenchido).
 *
 * NÃO aceita marcação: o texto é renderizado como texto pelo React, que
 * já escapa tudo, mas um valor com `<` guardado no banco continuaria
 * sendo lixo aparecendo na barra. Recusar na entrada é mais honesto que
 * exibir `<b>9h</b>` literalmente para o visitante.
 */
export function normalizarHorario(valor: string | null | undefined): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim().replace(/\s+/g, " ");
  return limpo || null;
}

export function horarioTemMarcacao(valor: string | null | undefined): boolean {
  return typeof valor === "string" && /[<>]/.test(valor);
}

/**
 * Mesma regra dos canais, agora para os dois locais: aparece se tiver
 * texto E estiver habilitado NAQUELE local. Devolve null — e não "" —
 * para quem renderiza não precisar decidir o que é vazio.
 *
 * UM texto, DUAS decisões: as duas leituras saem do mesmo `valor`, então
 * é impossível o topo e o rodapé mostrarem horários diferentes.
 */
export function horarioDoLocal(
  horario: ConfiguracaoHorario | undefined,
  local: LocalExibicao
): string | null {
  if (!horario || !horario[local]) return null;
  return normalizarHorario(horario.valor);
}

/** Atalho do caso mais comum — o topo, onde o horário nasceu. */
export function horarioDoTopo(horario: ConfiguracaoHorario | undefined): string | null {
  return horarioDoLocal(horario, "topo");
}

/** Um canal é um contato (tel/WhatsApp) ou uma rede social. */
export type TipoCanal = "TELEFONE" | "WHATSAPP" | "REDE";

export type ChaveCanal =
  | "telefone"
  | "whatsapp"
  | "instagram"
  | "facebook"
  | "linkedin"
  | "youtube"
  | "tiktok";

type DefinicaoCanal = {
  chave: ChaveCanal;
  tipo: TipoCanal;
  /** O nome que a pessoa lê — na configuração e no nome acessível. */
  rotulo: string;
};

// A ORDEM É A ORDEM DE EXIBIÇÃO, no topo, no rodapé e na configuração —
// uma lista só, para as três telas nunca discordarem. Contatos antes de
// redes porque é essa a hierarquia de quem procura atendimento.
export const CANAIS_PUBLICOS: readonly DefinicaoCanal[] = [
  { chave: "telefone", tipo: "TELEFONE", rotulo: "Telefone público" },
  { chave: "whatsapp", tipo: "WHATSAPP", rotulo: "WhatsApp" },
  { chave: "instagram", tipo: "REDE", rotulo: "Instagram" },
  { chave: "facebook", tipo: "REDE", rotulo: "Facebook" },
  { chave: "linkedin", tipo: "REDE", rotulo: "LinkedIn" },
  { chave: "youtube", tipo: "REDE", rotulo: "YouTube" },
  { chave: "tiktok", tipo: "REDE", rotulo: "TikTok" },
] as const;

/** O que a configuração guarda para um canal: o valor e os dois locais. */
export type ConfiguracaoCanal = {
  valor: string;
  topo: boolean;
  rodape: boolean;
};

export type ConfiguracaoCanais = Record<ChaveCanal, ConfiguracaoCanal>;

/** Um canal pronto para virar elemento na tela. */
export type CanalPublico = {
  chave: ChaveCanal;
  tipo: TipoCanal;
  rotulo: string;
  /** href já montado e seguro. */
  href: string;
  /** O que se lê quando o canal é exibido com texto (topo/rodapé). */
  texto: string;
  /** Links para fora do site abrem em nova aba, com rel de segurança. */
  externo: boolean;
};

// -----------------------------------------------------------------------
// Validação de URL de rede social
// -----------------------------------------------------------------------
// O valor vem de um formulário administrativo e vira `href` no site
// público de um tenant. Sem esta porta, um `javascript:` salvo na
// configuração viraria script executável para todo visitante — e até a
// Fase 58 estes campos eram `z.string()` livre, sem validação nenhuma.
//
// ALLOWLIST, nunca blocklist: só http e https passam. Tentar enumerar
// esquemas perigosos (javascript:, data:, vbscript:, e as variações com
// espaço/maiúscula/entidade) é uma corrida que se perde.
const PROTOCOLOS_PERMITIDOS = new Set(["http:", "https:"]);

export function urlRedeSocialValida(valor: string | null | undefined): boolean {
  if (typeof valor !== "string") return false;
  const limpo = valor.trim();
  if (!limpo) return false;
  let url: URL;
  try {
    url = new URL(limpo);
  } catch {
    // Sem esquema não é URL absoluta. Recusar é deliberado: um valor
    // relativo apontaria para dentro do próprio site, que nunca é o que
    // "meu perfil no Instagram" quer dizer.
    return false;
  }
  if (!PROTOCOLOS_PERMITIDOS.has(url.protocol)) return false;
  // `https://` sem host nenhum é URL válida para o parser e link morto
  // para a pessoa.
  return url.hostname !== "";
}

/**
 * Normaliza a URL de rede social para gravar. Devolve null quando o valor
 * não é utilizável — quem chama trata como "não configurado", nunca grava
 * lixo que o site teria de renderizar depois.
 */
export function normalizarUrlRedeSocial(valor: string | null | undefined): string | null {
  if (!urlRedeSocialValida(valor)) return null;
  return (valor as string).trim();
}

// -----------------------------------------------------------------------
// Resolução: configuração -> canais exibíveis em um local
// -----------------------------------------------------------------------

/** Só os dígitos, para o href `tel:`. O texto exibido mantém a formatação. */
function hrefTelefone(valor: string): string | null {
  const digitos = valor.replace(/\D/g, "");
  // Mesmo piso do WhatsApp (ver temWhatsApp): abaixo disso é número
  // incompleto, e um `tel:` quebrado é pior que nenhum telefone.
  if (digitos.length < 8) return null;
  return `tel:+${digitos}`;
}

/**
 * A REGRA FUNDAMENTAL da fase, num lugar só:
 *
 *   aparece  <=>  valor preenchido (e utilizável)  E  flag do local
 *
 * Qualquer das duas faltando devolve lista sem o canal — e é por isso que
 * nunca sobra ícone sem link, separador órfão ou barra vazia na tela:
 * quem renderiza recebe só o que já passou nas duas condições.
 */
export function canaisDoLocal(
  configuracao: ConfiguracaoCanais,
  local: LocalExibicao,
  opcoes: { nomeOrganizacao?: string } = {}
): CanalPublico[] {
  const canais: CanalPublico[] = [];

  for (const definicao of CANAIS_PUBLICOS) {
    const config = configuracao[definicao.chave];
    if (!config) continue;
    if (!config[local]) continue;

    const valor = (config.valor ?? "").trim();
    if (!valor) continue;

    if (definicao.tipo === "TELEFONE") {
      const href = hrefTelefone(valor);
      if (!href) continue;
      canais.push({ ...definicao, href, texto: valor, externo: false });
      continue;
    }

    if (definicao.tipo === "WHATSAPP") {
      if (!temWhatsApp(valor)) continue;
      // Reusa o gerador único do projeto — nada de montar wa.me à mão.
      // A mensagem é a mesma cortesia já usada nos outros pontos de
      // entrada, nunca um texto invasivo.
      const href = linkWhatsApp(
        valor,
        opcoes.nomeOrganizacao
          ? `Olá! Encontrei o site da ${opcoes.nomeOrganizacao} e gostaria de mais informações.`
          : undefined
      );
      if (!href) continue;
      // No topo o rótulo é "WhatsApp", e não o número: telefone e
      // WhatsApp lado a lado com dois números parecidos é ruído.
      canais.push({ ...definicao, href, texto: "WhatsApp", externo: true });
      continue;
    }

    // REDE — revalidado na LEITURA, e não só na escrita: um valor
    // gravado antes desta fase (quando não havia validação alguma) nunca
    // vira href só porque já está no banco.
    if (!urlRedeSocialValida(valor)) continue;
    canais.push({ ...definicao, href: valor, texto: definicao.rotulo, externo: true });
  }

  return canais;
}

/** Atalho de leitura: há algo a exibir neste local? */
export function temCanais(
  configuracao: ConfiguracaoCanais,
  local: LocalExibicao,
  opcoes: { nomeOrganizacao?: string } = {}
): boolean {
  return canaisDoLocal(configuracao, local, opcoes).length > 0;
}

// -----------------------------------------------------------------------
// Separadores da barra superior (Fase 58.4)
// -----------------------------------------------------------------------
// A barra mostra até três grupos — horário, redes e contatos — separados
// por um traço. A regra é POR GRUPO, nunca por combinação enumerada: um
// separador existe quando há conteúdo dos dois lados dele.
//
// Função pura e fora do componente porque a única parte difícil disto é
// lógica, não marcação: as redes desaparecem abaixo de `sm` (continuam no
// menu mobile), e um traço desenhado ao lado de um grupo invisível vira
// um traço solto. Aqui as oito combinações ficam verificáveis sem montar
// página nenhuma.
export type GruposDaBarra = {
  temHorario: boolean;
  temRedes: boolean;
  temContatos: boolean;
};

export type SeparadoresDaBarra = {
  /**
   * O traço depois do horário. Tem papel DUPLO: no desktop separa o
   * horário das redes; no mobile, com as redes fora, passa a separar o
   * horário dos contatos — o mesmo elemento, sem duplicar nada no DOM.
   */
  antesDasRedes: boolean;
  /**
   * `true` quando esse primeiro traço precisa sumir junto com as redes:
   * sem contatos, no mobile não sobraria nada depois dele.
   */
  antesDasRedesSoNoDesktop: boolean;
  /** O traço entre redes e contatos — sempre acompanha as redes. */
  antesDosContatos: boolean;
};

export function separadoresDaBarra(grupos: GruposDaBarra): SeparadoresDaBarra {
  const antesDasRedes = grupos.temHorario && (grupos.temRedes || grupos.temContatos);
  return {
    antesDasRedes,
    antesDasRedesSoNoDesktop: antesDasRedes && !grupos.temContatos,
    antesDosContatos: grupos.temRedes && grupos.temContatos,
  };
}
