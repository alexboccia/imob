"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TODOS = "__todos__";

// Dropdown de filtro genérico, escrito no parâmetro `filters` (JSON) da
// URL — mantém o padrão único de searchParams (page/pageSize/search/sort/
// filters) em vez de um parâmetro novo por filtro.
export function FiltroDropdown({
  chave,
  label,
  opcoes,
}: {
  chave: string;
  label: string;
  opcoes: { value: string; label: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  let filtrosAtuais: Record<string, string> = {};
  try {
    filtrosAtuais = JSON.parse(searchParams.get("filters") ?? "{}");
  } catch {
    filtrosAtuais = {};
  }
  const valorAtual = filtrosAtuais[chave] ?? TODOS;

  function aplicar(valor: string | null) {
    const novosFiltros = { ...filtrosAtuais };
    if (!valor || valor === TODOS) delete novosFiltros[chave];
    else novosFiltros[chave] = valor;

    const novo = new URLSearchParams(searchParams.toString());
    if (Object.keys(novosFiltros).length > 0) {
      novo.set("filters", JSON.stringify(novosFiltros));
    } else {
      novo.delete("filters");
    }
    novo.delete("page");
    router.push(`${pathname}?${novo.toString()}`);
  }

  return (
    <Select value={valorAtual} onValueChange={aplicar}>
      <SelectTrigger size="sm" className="w-[170px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{label}: todos</SelectItem>
        {opcoes.map((opcao) => (
          <SelectItem key={opcao.value} value={opcao.value}>
            {opcao.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
