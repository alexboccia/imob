import Link from "next/link";
import { IconeFechar, IconePessoa } from "@/components/icons";
import { caminhoPerfilCorretor } from "@/lib/perfil-publico-corretor";

// O filtro de corretor, visível e removível.
//
// Uma URL com um cuid dentro não explica nada a quem a recebe pelo
// WhatsApp: sem este bloco, a listagem filtrada pareceria simplesmente
// uma listagem com menos imóveis. O chip diz de quem é o recorte e
// oferece a saída.
//
// A linguagem visual é a MESMA dos "Selecionados" dos painéis de filtro
// (pílula cinza clara, nome, × ao lado) — é o vocabulário que a página
// já usa para dizer "isto está filtrado", só que aqui em tamanho de
// leitura em vez de tamanho de popover.
//
// Os dois controles são LINKS, não botões: funcionam sem JavaScript,
// aparecem no histórico e podem ser abertos em outra aba, como o resto
// da navegação pública. O × leva à mesma listagem sem este filtro —
// nenhum outro parâmetro é tocado (ver hrefSemFiltroCorretor).
export function FiltroCorretorAtivo({
  nome,
  membroId,
  basePath,
  hrefRemover,
}: {
  nome: string;
  membroId: string;
  basePath: string;
  hrefRemover: string;
}) {
  return (
    <div data-filtro-corretor className="mt-4 flex flex-wrap items-center gap-2">
      <span className="text-sm text-gray-500">Filtrando por:</span>
      {/* max-w-full + min-w-0 no miolo: um nome longo encolhe dentro da
          pílula em vez de empurrar o × para fora da tela em 320px. O nome
          completo continua no <h1> logo abaixo, então nada se perde. */}
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-gray-100 py-1 pl-3 pr-1 text-sm text-gray-800">
        <IconePessoa className="size-4 shrink-0 text-primary" />
        <Link
          href={caminhoPerfilCorretor(basePath, membroId)}
          className="min-w-0 truncate hover:underline"
        >
          Corretor: {nome}
        </Link>
        {/* Nome acessível de verdade, nunca só "×": para quem usa leitor
            de tela, "Remover filtro do corretor Fulano" é a única forma
            de saber o que este controle faz. */}
        <Link
          href={hrefRemover}
          aria-label={`Remover filtro do corretor ${nome}`}
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-900"
        >
          <IconeFechar className="size-3.5" />
        </Link>
      </span>
    </div>
  );
}
