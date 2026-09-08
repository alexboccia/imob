import { SLUGS_RESERVADOS } from "@/lib/platform/reserved-words";

// =======================================================================
// Slug da organização (Fase 26)
// =======================================================================
// O slug é IDENTIDADE PÚBLICA: vira o endereço do site da imobiliária
// (/{slug}) e, se um dia houver subdomínio, o nome dela na internet.
// Até aqui era digitado à mão pelo Super Admin, que sabia as regras.
// No self-service ninguém sabe — então ele é DERIVADO do nome, e a
// derivação precisa ser determinística e defensiva.

export const SLUG_MINIMO = 2;
export const SLUG_MAXIMO = 40;

// Normalização em passos explícitos, cada um com um motivo:
//
//   NFD + remoção de diacríticos  -> "Imobiliária Ação" vira
//                                    "imobiliaria acao", e não um slug
//                                    com bytes que quebram URL;
//   minúsculas                    -> o regex de rota do produto só
//                                    aceita minúsculas;
//   não-alfanumérico vira hífen   -> "&", "." e espaço viram separador;
//   hífens colapsados e aparados  -> nunca "--" nem começar/terminar com
//                                    hífen, que é o formato exigido pelo
//                                    schema já existente do /platform.
export function normalizarSlug(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SLUG_MAXIMO)
    // O slice pode ter deixado um hífen na ponta.
    .replace(/-$/, "");
}

// Reservados comparados JÁ NORMALIZADOS, dos dois lados.
//
// A lista original é escrita para o slug digitado à mão no /platform e
// contém "_next", que a derivação transforma em "next" — comparar sem
// normalizar deixava "next" passar. O caso é inofensivo (a rota real é
// "/_next"), mas o buraco não era: qualquer entrada futura com maiúscula,
// ponto ou acento escaparia da mesma forma, e só se descobriria quando a
// rota quebrasse em produção.
const RESERVADOS_NORMALIZADOS = new Set(
  [...SLUGS_RESERVADOS].map((palavra) => normalizarSlug(palavra))
);

export type ResultadoSlug =
  | { valido: true; slug: string }
  | { valido: false; motivo: "vazio" | "curto" | "reservado" };

// Um nome que não produz slug nenhum ("!!!", "###") não é erro de
// digitação a ser silenciado com um valor inventado: é um nome que o
// produto não consegue transformar em endereço, e quem cadastrou
// precisa saber disso.
export function derivarSlug(nome: string): ResultadoSlug {
  const slug = normalizarSlug(nome);
  if (!slug) return { valido: false, motivo: "vazio" };
  if (slug.length < SLUG_MINIMO) return { valido: false, motivo: "curto" };
  // Um slug reservado colidiria com uma rota real do produto (/app,
  // /api, /platform, /contato...). A lista é a MESMA já usada pelo
  // Super Admin e por hostnameReservado — um único lugar de verdade.
  if (RESERVADOS_NORMALIZADOS.has(slug)) return { valido: false, motivo: "reservado" };
  return { valido: true, slug };
}
