import { Quote } from "lucide-react";

// Frase de destaque (Fase 40) — logo abaixo da descrição, na ficha
// pública.
//
// CONTEÚDO, NÃO INTERAÇÃO: não é botão, não é link, não recebe tabindex,
// não tem role. É um parágrafo dentro de um bloco com tratamento
// editorial — e a acessibilidade certa aqui é justamente não inventar
// semântica que não existe.
//
// AS ASPAS SÃO DESENHO. O ícone é decorativo (aria-hidden) e o texto vai
// inteiro, exatamente como o corretor escreveu: o banco não guarda aspas
// e a tela não as acrescenta ao redor da frase. Ícone + aspas
// tipográficas seria ornamento duplicado.
//
// NÃO É DEPOIMENTO. Por isso <p> dentro de um <aside>, e não
// <blockquote>/<cite>: não há autor, não há obra citada, e marcar como
// citação afirmaria uma atribuição que não existe. É a própria
// imobiliária destacando um argumento do imóvel.
//
// TEXTO PURO: React escapa por construção. Nada de
// dangerouslySetInnerHTML, nada de Markdown — "<script>" cadastrado
// aparece como os caracteres que são.
export function FraseDestaque({ frase }: { frase: string | null }) {
  // Sem frase, nenhum bloco: nem borda vazia, nem aspas soltas, nem
  // "sem frase cadastrada". O espaço simplesmente não existe.
  const texto = frase?.trim();
  if (!texto) return null;

  return (
    <aside
      data-frase-destaque
      // items-start: com duas ou três linhas o ícone fica junto da
      // primeira, não centralizado no bloco inteiro.
      className="mt-6 flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:gap-4 sm:p-5"
    >
      {/* shrink-0: em 320px o ícone não pode roubar largura do texto nem
          ser esmagado por ele. */}
      <Quote
        className="size-6 shrink-0 text-gray-300 sm:size-7"
        aria-hidden
      />
      {/* Sem line-clamp, sem altura fixa, sem ellipsis: o bloco cresce
          com a frase e nenhuma palavra é cortada. */}
      <p className="min-w-0 text-base leading-relaxed text-balance text-gray-700 sm:text-lg">
        {texto}
      </p>
    </aside>
  );
}
