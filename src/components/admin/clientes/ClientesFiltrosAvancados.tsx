"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ORIGEM_LABEL, PAPEL_LABEL } from "@/lib/crm-labels";
import { rotuloSelecionado } from "@/lib/select-rotulo";
import { SlidersHorizontal } from "lucide-react";

const TODOS = "__todos__";

// Mesmo bug de Select controlado do Base UI já corrigido nas telas
// públicas na Fase 6 (ver src/lib/select-rotulo.ts): sem `children` como
// função, o SelectValue mostra "__todos__" no lugar de "Todas"/"Todos".
// Aqui é interno (só o corretor vê), mas é o mesmo defeito e a mesma
// correção de uma linha. Só a APRESENTAÇÃO muda: o sentinela, os
// filtros, os query params e o estado continuam idênticos.
const ROTULOS_ORIGEM: Record<string, string> = { [TODOS]: "Todas", ...ORIGEM_LABEL };
const ROTULOS_PAPEL: Record<string, string> = { [TODOS]: "Todos", ...PAPEL_LABEL };

// Redesenho da tela de Clientes — filtros por origem/papel. Os dois já
// existem como colunas reais (Person.source/Person.roles), só não eram
// expostos como filtro de URL antes desta tela — nenhum campo novo,
// nenhuma migration; só interpretarFiltros/construirWhereClientes
// (já existentes) ganharam mais duas chaves na allowlist.
export function ClientesFiltrosAvancados() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  let filtrosAtuais: Record<string, string> = {};
  try {
    filtrosAtuais = JSON.parse(searchParams.get("filters") ?? "{}");
  } catch {
    filtrosAtuais = {};
  }

  const origemAtual = filtrosAtuais.origem ?? TODOS;
  const papelAtual = filtrosAtuais.papel ?? TODOS;
  const ativos = [filtrosAtuais.origem, filtrosAtuais.papel].filter(Boolean).length;

  function aplicar(chave: "origem" | "papel", valor: string | null) {
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" />}>
        <SlidersHorizontal className="size-4" />
        Filtros avançados
        {ativos > 0 && (
          <span className="ml-1 flex size-4.5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
            {ativos}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64">
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Origem</label>
            <Select value={origemAtual} onValueChange={(v) => aplicar("origem", v)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(valor) => rotuloSelecionado(valor, ROTULOS_ORIGEM, "Todas")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {Object.entries(ORIGEM_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Papel</label>
            <Select value={papelAtual} onValueChange={(v) => aplicar("papel", v)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(valor) => rotuloSelecionado(valor, ROTULOS_PAPEL, "Todos")}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {Object.entries(PAPEL_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
