import {
  hexValido,
  hexParaOklch,
  oklchParaHex,
  razaoContraste,
  BRANCO,
  QUASE_PRETO,
  type Oklch,
} from "@/lib/branding/oklch-color";

// =======================================================================
// Cor de fundo da barra superior (Fase 58.5)
// =======================================================================
// UMA cor, configurável por organização, aplicada EXCLUSIVAMENTE à faixa
// de contatos do topo — nunca ao cabeçalho com logotipo e menu, nunca ao
// rodapé, nunca a qualquer outra superfície.
//
// null (o padrão, e o valor de todo tenant existente) significa "use o
// visual de sempre": a barra continua com `bg-muted`/`text-muted-
// foreground` e nada muda no deploy.
//
// SEM CSS LIVRE: o valor aceito é exclusivamente "#RRGGBB", pela MESMA
// função que o resto do branding já usa (hexValido). Nada aqui vira
// classe Tailwind montada com texto do banco nem string de CSS injetada:
// o que sai deste módulo são hex já validados, que o componente aplica
// como valor de propriedade no `style`. `url(...)`, `var(...)`,
// `linear-gradient(...)` e afins não passam da validação — não existe
// caminho por onde eles cheguem ao documento.

/** Verde da marca do WhatsApp, o mesmo que --whatsapp-brand resolve. */
// Espelha `--color-green-600` do Tailwind (oklch(62.7% 0.194 149.214)),
// que é o que `--whatsapp-brand` aponta em globals.css. Existe aqui
// porque a decisão de contraste é tomada no SERVIDOR, onde não há como
// ler uma variável CSS. Se o token mudar, este valor precisa mudar junto
// — há teste amarrando os dois (ver cor-barra-topo.test.ts).
const VERDE_WHATSAPP: Oklch = { l: 0.627, c: 0.194, h: 149.214 };

// 3:1 é o mínimo do WCAG 1.4.11 para objetos gráficos (o ícone não é
// texto). Abaixo disso o verde deixa de ser reconhecível contra o fundo
// e o ícone precisa ceder a cor.
const CONTRASTE_MINIMO_ICONE = 3;

export type EstiloBarraTopo = {
  /** Fundo, hex validado. */
  fundo: string;
  /** Cor do conteúdo: texto, ícones de rede e separadores. */
  conteudo: string;
  /**
   * Cor do ícone do WhatsApp. Continua sendo o verde da marca sempre que
   * ele é distinguível do fundo; quando não é, acompanha o conteúdo.
   */
  whatsapp: string;
};

/** Hex normalizado (aparado, minúsculo) ou null quando não é utilizável. */
export function normalizarCorBarraTopo(valor: string | null | undefined): string | null {
  if (!hexValido(valor)) return null;
  return (valor as string).trim().toLowerCase();
}

/**
 * Resolve as cores da barra a partir da configuração do tenant.
 *
 * null => sem personalização: quem renderiza mantém as classes de
 * sempre. Devolver null (em vez de devolver o hex do visual atual) é o
 * que garante retrocompatibilidade de verdade: nenhum tenant passa a ter
 * cor fixa gravada só porque o campo existe.
 */
export function estiloDaBarraTopo(
  valor: string | null | undefined
): EstiloBarraTopo | null {
  const fundo = normalizarCorBarraTopo(valor);
  if (!fundo) return null;

  const corFundo = hexParaOklch(fundo);
  if (!corFundo) return null;

  // Mesma regra que o gerador de paleta já usa para escolher o
  // `onPrimary`: entre branco e quase-preto, vence quem tiver mais
  // contraste com o fundo. Um fundo claro recebe conteúdo escuro e
  // vice-versa, sem heurística própria.
  const conteudo =
    razaoContraste(corFundo, BRANCO) >= razaoContraste(corFundo, QUASE_PRETO)
      ? BRANCO
      : QUASE_PRETO;

  const verdeLegivel = razaoContraste(corFundo, VERDE_WHATSAPP) >= CONTRASTE_MINIMO_ICONE;

  return {
    fundo,
    conteudo: oklchParaHex(conteudo),
    // Decisão LOCAL da barra, deliberadamente: o token global
    // --whatsapp-brand continua intocado, e o botão flutuante e a ficha
    // do imóvel seguem verdes como sempre. Só aqui, onde o fundo é
    // escolhido pelo tenant, o ícone pode precisar ceder para não sumir.
    whatsapp: verdeLegivel ? oklchParaHex(VERDE_WHATSAPP) : oklchParaHex(conteudo),
  };
}
