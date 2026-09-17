import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MigalhaImovel } from "@/lib/breadcrumb-imovel";

// Faixa de contexto no topo da ficha (Fase 46): de onde o imóvel vem na
// navegação do site e, ao lado, a situação dele. São DUAS coisas
// diferentes e o HTML diz isso — um <nav> com <ol> para o caminho e uma
// lista à parte para os selos, que não são navegação.
//
// Compacta de propósito: texto pequeno, sem fundo, sem borda, sem card.
// Substitui a linha "tipo · finalidade + rótulos" que ficava no mesmo
// lugar, então a primeira tela não perde altura.
//
// A última migalha é o bairro, que é uma listagem — não a página atual —
// e por isso não recebe aria-current.

export type SeloContexto = {
  chave: string;
  label: string;
  /** Classes de cor do rótulo comercial (format.ts), quando houver. */
  className?: string;
  tipo: "rotulo" | "obra" | "codigo";
};

export function BreadcrumbImovel({
  migalhas,
  selos,
}: {
  migalhas: MigalhaImovel[];
  selos: SeloContexto[];
}) {
  return (
    <div data-contexto-imovel className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      <nav aria-label="Breadcrumb" data-breadcrumb className="min-w-0">
        <ol className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-gray-600">
          {migalhas.map((migalha, i) => (
            <li key={`${i}-${migalha.label}`} className="inline-flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-gray-400" />}
              <Link
                href={migalha.href}
                className="break-words rounded-sm underline-offset-4 outline-none transition-colors hover:text-gray-900 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {migalha.label}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      {selos.length > 0 && (
        <ul aria-label="Situação do imóvel" data-selos-imovel className="flex flex-wrap items-center gap-1.5">
          {selos.map((selo) => (
            // flex: o item tem a altura do selo (20px), não a da linha de
            // texto herdada — cada linha de selos fica 4px mais baixa.
            <li key={selo.chave} data-selo={selo.tipo} className="flex">
              {selo.tipo === "rotulo" ? (
                <Badge className={selo.className}>{selo.label}</Badge>
              ) : selo.tipo === "obra" ? (
                <Badge variant="secondary">{selo.label}</Badge>
              ) : (
                <Badge variant="outline" className="font-normal text-gray-600">
                  {selo.label}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
