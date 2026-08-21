"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ArrowUp, ArrowDown } from "lucide-react";

const CAMPOS = [
  { campo: "nome" as const, label: "Nome" },
  { campo: "email" as const, label: "E-mail" },
];

// Correção do Finding #1 (auditoria pré-commit) — a coluna "Usuário" funde
// nome+e-mail visualmente, mas o redesenho removeu o único jeito de
// ordenar por e-mail pela UI (só sobrava editar a URL manualmente, que a
// auditoria não aceitou como capacidade preservada). Em vez de desfazer a
// coluna combinada, o cabeçalho ganha dois alvos de ordenação próprios
// (Nome / E-mail), cada um clicável de forma independente — mesmo
// mecanismo de URL (`?sort=campo:direcao`) já usado pelo resto do
// DataTable, só que construído aqui (não pelo wrapper automático do
// DataTable, que só suporta um campo por coluna) para não exigir nenhuma
// mudança no componente compartilhado. `nome` propositalmente removido de
// SORT_MAP em page.tsx para que o DataTable não tente embrulhar este
// cabeçalho no próprio <button> dele (evitaria botão dentro de botão).
export function UsuarioColunaOrdenacao() {
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
      {CAMPOS.map(({ campo, label }, indice) => {
        const ativo = campoAtual === campo;
        return (
          <span key={campo} className="inline-flex items-center gap-1.5">
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
    </span>
  );
}
