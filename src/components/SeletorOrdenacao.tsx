"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IconeChevronEsquerdo } from "@/components/icons";

const OPCOES = [
  { valor: "relevantes", label: "Mais relevantes" },
  { valor: "menor_valor", label: "Menor valor" },
  { valor: "maior_valor", label: "Maior valor" },
  { valor: "menor_metragem", label: "Menor metragem" },
  { valor: "maior_metragem", label: "Maior metragem" },
];

export function SeletorOrdenacao({ valorAtual }: { valorAtual: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function aoMudar(event: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (event.target.value === "relevantes") {
      params.delete("ordenar");
    } else {
      params.set("ordenar", event.target.value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-gray-500 whitespace-nowrap">Ordenar por:</span>
      <span className="relative">
        <select
          value={valorAtual}
          onChange={aoMudar}
          className="appearance-none border rounded-md pl-3 pr-8 py-2 font-medium"
        >
          {OPCOES.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.label}
            </option>
          ))}
        </select>
        <IconeChevronEsquerdo className="w-3.5 h-3.5 -rotate-90 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500" />
      </span>
    </label>
  );
}
