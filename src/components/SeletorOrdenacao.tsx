"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { rotuloSelecionado } from "@/lib/select-rotulo";

const OPCOES = [
  { valor: "relevantes", label: "Mais relevantes" },
  { valor: "menor_valor", label: "Menor valor" },
  { valor: "maior_valor", label: "Maior valor" },
  { valor: "menor_metragem", label: "Menor metragem" },
  { valor: "maior_metragem", label: "Maior metragem" },
];

// Mesmo bug do seletor da Home, só menos visível: o Select controlado
// mostrava "relevantes"/"menor_valor" (o valor cru) no lugar de "Mais
// relevantes"/"Menor valor". Confirmado no HTML servido por produção
// antes desta correção.
const ROTULOS_ORDENACAO: Record<string, string> = Object.fromEntries(
  OPCOES.map((o) => [o.valor, o.label])
);

export function SeletorOrdenacao({ valorAtual }: { valorAtual: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function aoMudar(valor: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!valor || valor === "relevantes") {
      params.delete("ordenar");
    } else {
      params.set("ordenar", valor);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground whitespace-nowrap">
        Ordenar por:
      </span>
      <Select value={valorAtual} onValueChange={aoMudar}>
        <SelectTrigger>
          <SelectValue>
            {(valor) => rotuloSelecionado(valor, ROTULOS_ORDENACAO, "Mais relevantes")}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {OPCOES.map((opcao) => (
            <SelectItem key={opcao.valor} value={opcao.valor}>
              {opcao.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
