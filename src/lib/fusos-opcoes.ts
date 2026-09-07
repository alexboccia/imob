import { fusoValido, rotuloFuso, FUSO_PADRAO } from "@/lib/fuso-horario";

// Opções do seletor de fuso horário (Fase 18).
//
// A lista vem do RUNTIME (Intl.supportedValuesOf("timeZone")), não de uma
// tabela nossa: uma lista IANA hardcoded envelhece a cada atualização de
// tzdata e, pior, envelhece em silêncio. O que se persiste é sempre o
// identificador IANA; o rótulo é só apresentação.
//
// A UX não pede que ninguém digite "America/Sao_Paulo": um <select>
// nativo, com os fusos do Brasil em destaque e o resto agrupado abaixo.
// Nativo de propósito — busca por digitação, teclado e leitor de tela
// funcionam sem uma linha de JavaScript, e não há risco de divergência
// entre servidor e cliente.

export type OpcaoFuso = { valor: string; rotulo: string };
export type GrupoFusos = { titulo: string; opcoes: OpcaoFuso[] };

// Destaque, não restrição: o produto é vendido no Brasil hoje, e estes
// são os fusos que cobrem o país (todos os quatro offsets, incluindo
// Fernando de Noronha e o Acre). UTC entra no topo porque é o
// comportamento de quem nunca configurou nada — quem quiser continuar
// exatamente como está precisa conseguir escolher isso explicitamente.
const FUSOS_DESTAQUE: readonly string[] = [
  FUSO_PADRAO,
  "America/Sao_Paulo",
  "America/Fortaleza",
  "America/Recife",
  "America/Bahia",
  "America/Belem",
  "America/Manaus",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Noronha",
];

export function opcoesDeFuso(atual: string, referencia: Date = new Date()): GrupoFusos[] {
  const todos = Intl.supportedValuesOf("timeZone");
  const destaque = FUSOS_DESTAQUE.filter(fusoValido);
  const jaListados = new Set(destaque);

  const grupos: GrupoFusos[] = [
    {
      titulo: "Brasil e UTC",
      opcoes: destaque.map((valor) => ({ valor, rotulo: rotuloFuso(valor, referencia) })),
    },
    {
      titulo: "Todos os fusos",
      opcoes: todos
        .filter((valor) => !jaListados.has(valor))
        .map((valor) => ({ valor, rotulo: `${valor} (${rotuloFuso(valor, referencia)})` })),
    },
  ];

  // Um fuso configurado que saiu da lista canônica numa atualização de
  // tzdata continuaria válido no banco mas sumiria do seletor — e salvar
  // o formulário o trocaria silenciosamente por outro. Ele aparece como
  // opção própria em vez de desaparecer.
  if (!fusoValido(atual) || (!jaListados.has(atual) && !todos.includes(atual))) {
    grupos.unshift({
      titulo: "Configuração atual",
      opcoes: [{ valor: atual, rotulo: `${atual} (fora do catálogo atual)` }],
    });
  }

  return grupos;
}
