"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

// Filtro de período — "de"/"ate" como parâmetros PRÓPRIOS da URL, não
// dentro do "filters" (JSON) usado por FiltroDropdown: são datas, não um
// valor de dropdown numa allowlist, e <input type="date"> já navega sem
// debounce (o evento onChange só dispara quando o usuário termina de
// escolher a data, nunca por tecla).
export function PeriodoFiltro() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navegarCom(chave: "de" | "ate", valor: string) {
    const novo = new URLSearchParams(searchParams.toString());
    if (valor) novo.set(chave, valor);
    else novo.delete(chave);
    novo.delete("page");
    router.push(`${pathname}?${novo.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="auditoria-periodo-de" className="text-sm text-muted-foreground">
        De
      </label>
      <Input
        id="auditoria-periodo-de"
        type="date"
        className="w-[150px]"
        defaultValue={searchParams.get("de") ?? ""}
        onChange={(e) => navegarCom("de", e.target.value)}
      />
      <label htmlFor="auditoria-periodo-ate" className="text-sm text-muted-foreground">
        até
      </label>
      <Input
        id="auditoria-periodo-ate"
        type="date"
        className="w-[150px]"
        defaultValue={searchParams.get("ate") ?? ""}
        onChange={(e) => navegarCom("ate", e.target.value)}
      />
    </div>
  );
}
