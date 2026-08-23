"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowUp, ArrowDown } from "lucide-react";

const CAMPOS = [
  { campo: "code" as const, label: "Código" },
  { campo: "title" as const, label: "Título" },
];

// Redesenho de Imóveis — a coluna "Imóvel" funde Código+Título
// visualmente (título é a informação principal, código secundário — ver
// prompt), mas isso não pode perder a capacidade real de ordenar por
// Código OU por Título separadamente. Mesmo mecanismo exato de
// UsuarioColunaOrdenacao.tsx (dois alvos de ordenação clicáveis
// independentes, escrevendo `?sort=campo:direcao` na URL), reaproveitado
// aqui em vez de duplicado, com `code`/`title` (nomes reais do campo
// Prisma, não os ids de coluna do DataTable) — mesmos valores que
// page.tsx já aceita em CAMPOS_ORDENAVEIS. "imovel" propositalmente FORA
// de SORT_MAP em page.tsx, mesma razão: o DataTable não pode embrulhar
// este cabeçalho custom no próprio <button> dele (botão dentro de botão).
export function ImovelColunaOrdenacao() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sortAtual = searchParams.get("sort") ?? "";
  const [campoAtual, direcaoAtual] = sortAtual.split(":");

  function ordenarPor(campo: string) {
    const proximaDirecao = campoAtual === campo && direcaoAtual === "asc" ? "desc" : "asc";
    const novo = new URLSearchParams(searchParams.toString());
    novo.set("sort", `${campo}:${proximaDirecao}`);
    novo.delete("page");
    router.push(`${pathname}?${novo.toString()}`);
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      Imóvel
      <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
        (
        {CAMPOS.map(({ campo, label }, indice) => {
          const ativo = campoAtual === campo;
          return (
            <span key={campo} className="inline-flex items-center gap-1">
              {indice > 0 && <span className="text-muted-foreground/40">·</span>}
              <button
                type="button"
                onClick={() => ordenarPor(campo)}
                aria-label={`Ordenar por ${label}${ativo ? (direcaoAtual === "asc" ? ", ordem ascendente" : ", ordem descendente") : ""}`}
                className={`inline-flex items-center gap-0.5 hover:text-foreground ${ativo ? "font-medium text-foreground" : ""}`}
              >
                {label}
                {ativo &&
                  (direcaoAtual === "asc" ? (
                    <ArrowUp className="size-3" />
                  ) : (
                    <ArrowDown className="size-3" />
                  ))}
              </button>
            </span>
          );
        })}
        )
      </span>
    </span>
  );
}
