// Catálogo de temas do site público — fixo em código, nunca no banco.
// OrganizationBranding.themeId só guarda a chave (ver prisma/schema.prisma);
// trocar de tema é escolher uma chave existente aqui, não escrever cor.
//
// themeId é um identificador técnico estável — nunca renomear uma chave
// existente (organizações já salvaram esse valor no banco). O "nome"
// (label) pode mudar livremente a qualquer momento.
//
// secondary é sempre calibrado claro (luminosidade alta, croma baixo) em
// todos os temas de propósito: ele reaproveita o --secondary-foreground
// fixo do shadcn (quase preto), então precisa continuar legível em
// qualquer tema sem precisar de um token "onSecondary" à parte. border
// segue a mesma lógica, só trocando o matiz do cinza neutro atual.
//
// onPrimary não é calculado em runtime — é fixado por tema na calibração
// abaixo (branco quando primary é escuro, quase-preto quando é claro).
export type TokensTema = {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  onPrimary: string;
  secondary: string;
  border: string;
  link: string;
};

export type Tema = {
  id: string;
  label: string;
} & TokensTema;

export const TEMA_PADRAO_ID = "classic-blue";

export const CATALOGO_TEMAS: Record<string, Tema> = {
  "classic-blue": {
    id: "classic-blue",
    label: "Azul Clássico",
    primary: "oklch(0.55 0.18 255)",
    primaryHover: "oklch(0.47 0.19 255)",
    primaryLight: "oklch(0.93 0.03 255)",
    onPrimary: "oklch(1 0 0)",
    secondary: "oklch(0.96 0.02 255)",
    border: "oklch(0.88 0.02 255)",
    link: "oklch(0.55 0.18 255)",
  },
  forest: {
    id: "forest",
    label: "Verde Floresta",
    // Mais escuro/dessaturado que --success (verde-600) de propósito —
    // evita que o CTA principal do site pareça um estado de "sucesso".
    primary: "oklch(0.42 0.09 165)",
    primaryHover: "oklch(0.35 0.09 165)",
    primaryLight: "oklch(0.93 0.03 165)",
    onPrimary: "oklch(1 0 0)",
    secondary: "oklch(0.96 0.015 165)",
    border: "oklch(0.88 0.02 165)",
    link: "oklch(0.42 0.09 165)",
  },
  wine: {
    id: "wine",
    label: "Vinho",
    // Hue deslocado pra magenta/bordô e bem mais escuro/dessaturado que
    // --destructive (vermelho-alerta) — não deve ler como erro.
    primary: "oklch(0.38 0.12 15)",
    primaryHover: "oklch(0.32 0.13 15)",
    primaryLight: "oklch(0.92 0.04 15)",
    onPrimary: "oklch(1 0 0)",
    secondary: "oklch(0.96 0.02 15)",
    border: "oklch(0.87 0.03 15)",
    link: "oklch(0.38 0.12 15)",
  },
  graphite: {
    id: "graphite",
    label: "Grafite",
    // Continuidade proposital com o preto de ação usado antes de existir
    // tema por organização (Fase 2, parte 1).
    primary: "oklch(0.25 0.01 260)",
    primaryHover: "oklch(0.18 0.01 260)",
    primaryLight: "oklch(0.93 0.005 260)",
    onPrimary: "oklch(1 0 0)",
    secondary: "oklch(0.96 0.005 260)",
    border: "oklch(0.87 0.01 260)",
    link: "oklch(0.25 0.01 260)",
  },
  gold: {
    id: "gold",
    label: "Dourado",
    // Hue mais amarelo/mostarda (85) que o laranja vívido de
    // --label-opportunity (47) — evita confundir o CTA de marca com o
    // rótulo "Oportunidade" de imóvel. Claro o bastante pra precisar de
    // onPrimary escuro em vez de branco.
    primary: "oklch(0.62 0.14 85)",
    primaryHover: "oklch(0.54 0.15 85)",
    primaryLight: "oklch(0.94 0.04 85)",
    onPrimary: "oklch(0.2 0 0)",
    secondary: "oklch(0.96 0.02 85)",
    border: "oklch(0.88 0.03 85)",
    link: "oklch(0.62 0.14 85)",
  },
  violet: {
    id: "violet",
    label: "Violeta",
    primary: "oklch(0.5 0.19 300)",
    primaryHover: "oklch(0.42 0.2 300)",
    primaryLight: "oklch(0.93 0.04 300)",
    onPrimary: "oklch(1 0 0)",
    secondary: "oklch(0.96 0.02 300)",
    border: "oklch(0.88 0.03 300)",
    link: "oklch(0.5 0.19 300)",
  },
};

// Fallback obrigatório: linha OrganizationBranding ausente, themeId nulo/
// vazio, ou themeId que não existe mais no catálogo (tema descontinuado)
// — todos caem em TEMA_PADRAO_ID. Nunca lança, nunca quebra a renderização
// de um tenant por causa de configuração de tema ausente ou inválida.
export function resolverTema(themeId: string | null | undefined): Tema {
  return CATALOGO_TEMAS[themeId ?? ""] ?? CATALOGO_TEMAS[TEMA_PADRAO_ID];
}

// Sentinela de themeId reservado pro tema gerado automaticamente a partir
// do logotipo (ver gerar-paleta.ts) — nunca existe no CATALOGO_TEMAS fixo
// acima de propósito (catálogo continua sendo só os 6 temas prontos,
// nunca ganha uma entrada "customizável"). O valor persistido de verdade
// fica em OrganizationBranding.customTheme (JSON validado, ver
// tokens-tema-schema.ts), não aqui.
export const THEME_ID_CUSTOMIZADO = "custom";

// Label exibido tanto pelo swatch em SeletorTema.tsx quanto por
// resolverTemaEfetivo abaixo — uma única fonte pro texto, nunca duplicado.
export const LABEL_TEMA_CUSTOMIZADO = "Personalizado (gerado do logotipo)";

// Mesmo contrato de resolverTema, mas também considera um tema
// personalizado (gerado do logotipo) quando themeId === "custom" e o
// JSON persistido é válido. Ponto de entrada usado por
// [orgSlug]/layout.tsx no lugar de resolverTema puro — resolverTema
// continua existindo e sendo usado sozinho onde só o catálogo fixo faz
// sentido (ex: SeletorTema já sabe listar os 6 temas prontos por conta
// própria). Nunca lança: customTheme inválido/ausente cai no mesmo
// fallback de sempre (TEMA_PADRAO_ID), exatamente como um themeId
// desconhecido cairia.
export function resolverTemaEfetivo(
  themeId: string | null | undefined,
  temaCustomizado: TokensTema | null | undefined
): Tema {
  if (themeId === THEME_ID_CUSTOMIZADO && temaCustomizado) {
    return {
      id: THEME_ID_CUSTOMIZADO,
      label: LABEL_TEMA_CUSTOMIZADO,
      ...temaCustomizado,
    };
  }
  return resolverTema(themeId);
}
