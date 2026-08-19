"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { ESTAGIO_LABEL, ESTAGIOS_PIPELINE } from "@/lib/crm-labels";

const TODOS = "__todos__";

// Redesenho da tela de Clientes — chips de filtro rápido por estágio,
// visualmente substituindo o <FiltroDropdown> genérico só nesta tela
// (FiltroDropdown continua existindo/em uso nas outras listagens). Mesmo
// contrato de URL do FiltroDropdown por baixo (parâmetro `filters` em
// JSON, chave "estagioFunil") — só a apresentação muda, pra manter
// compatibilidade com o `interpretarFiltros`/`construirWhereClientes` já
// existentes em page.tsx, sem duplicar a lógica de leitura/escrita de URL.
//
// Só os 6 estágios REAIS de PipelineStage viram chip — o mockup aprovado
// tinha um chip extra "Qualificados" sem estágio correspondente no enum
// real; omitido de propósito (ver relatório final).
export function ClientesFiltrosEstagio() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  let filtrosAtuais: Record<string, string> = {};
  try {
    filtrosAtuais = JSON.parse(searchParams.get("filters") ?? "{}");
  } catch {
    filtrosAtuais = {};
  }
  const valorAtual = filtrosAtuais.estagioFunil ?? TODOS;

  function aplicar(valor: string) {
    const novosFiltros = { ...filtrosAtuais };
    if (valor === TODOS) delete novosFiltros.estagioFunil;
    else novosFiltros.estagioFunil = valor;

    const novo = new URLSearchParams(searchParams.toString());
    if (Object.keys(novosFiltros).length > 0) {
      novo.set("filters", JSON.stringify(novosFiltros));
    } else {
      novo.delete("filters");
    }
    novo.delete("page");
    router.push(`${pathname}?${novo.toString()}`);
  }

  const chips = [
    { value: TODOS, label: "Todos" },
    ...ESTAGIOS_PIPELINE.map((valor) => ({ value: valor, label: ESTAGIO_LABEL[valor] })),
  ];

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por estágio">
      {chips.map((chip) => (
        <button
          key={chip.value}
          type="button"
          onClick={() => aplicar(chip.value)}
          aria-pressed={valorAtual === chip.value}
          className={cn(
            "h-8 rounded-lg px-3 text-sm font-medium transition-colors",
            valorAtual === chip.value
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-muted"
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
