// Tipagem mínima da Web EyeDropper API — o lib.dom.d.ts do TypeScript
// ainda não a declara, e o resto do projeto não usa `any`. Só o que a
// aplicação realmente consome (open + sRGBHex), nada além disso.
//
// A API existe só em alguns navegadores (Chromium). Todo consumo passa
// por `abrirContaGotas` abaixo, que já faz a detecção — nenhum componente
// deve tocar em `window.EyeDropper` direto.
export type ResultadoContaGotas = { sRGBHex: string };

type EyeDropperInstance = {
  open: (opcoes?: { signal?: AbortSignal }) => Promise<ResultadoContaGotas>;
};

type ConstrutorEyeDropper = new () => EyeDropperInstance;

type JanelaComContaGotas = Window & { EyeDropper?: ConstrutorEyeDropper };

// Detecção de suporte. Só pode rodar no client: durante o SSR não existe
// `window`, e por isso quem chama precisa fazer isso dentro de efeito/
// handler — nunca no corpo do render, senão o HTML do servidor e o da
// hidratação divergem.
export function contaGotasSuportado(): boolean {
  return typeof window !== "undefined" && typeof window.EyeDropper === "function";
}

// Abre o conta-gotas e devolve o hex escolhido, ou null quando:
//   - o navegador não suporta a API;
//   - o usuário cancelou (ESC / clique fora) — a API rejeita com
//     AbortError nesse caso, que NÃO é erro de verdade e por isso não
//     sobe pra quem chamou nem vira log/toast.
// Qualquer outra falha também vira null: para o uso aqui (escolher uma
// cor) não há nada útil a fazer além de manter a cor anterior.
export async function abrirContaGotas(): Promise<string | null> {
  if (!contaGotasSuportado()) return null;
  const construtor = (window as JanelaComContaGotas).EyeDropper;
  if (!construtor) return null;
  try {
    const { sRGBHex } = await new construtor().open();
    return sRGBHex;
  } catch {
    return null;
  }
}

declare global {
  interface Window {
    EyeDropper?: ConstrutorEyeDropper;
  }
}
