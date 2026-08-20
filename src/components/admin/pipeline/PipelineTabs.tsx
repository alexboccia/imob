import Link from "next/link";
import { cn } from "@/lib/utils";
import type { VisaoPipeline } from "@/lib/pipeline";

// Redesenho do Pipeline — mesmo mecanismo de sempre (2 <Link>, URL-driven,
// preserva os demais filtros via `href` já resolvido pelo caller): só a
// apresentação vira tabs visuais (pill ativo vs. inativo, mesmo padrão de
// chip de ClientesFiltrosEstagio), sem nenhum estado client-side novo.
export function PipelineTabs({
  visao,
  emAndamento,
  hrefAberta,
  hrefEncerrada,
}: {
  visao: VisaoPipeline;
  emAndamento: number;
  hrefAberta: string;
  hrefEncerrada: string;
}) {
  const tabs = [
    { valor: "ABERTA" as const, label: "Em andamento", contagem: emAndamento, href: hrefAberta },
    { valor: "ENCERRADA" as const, label: "Encerradas", contagem: null, href: hrefEncerrada },
  ];

  return (
    <nav className="flex flex-wrap gap-2" aria-label="Situação da negociação">
      {tabs.map((tab) => (
        <Link
          key={tab.valor}
          href={tab.href}
          aria-current={visao === tab.valor ? "page" : undefined}
          className={cn(
            "h-8 rounded-lg px-3 text-sm font-medium transition-colors",
            visao === tab.valor
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-muted"
          )}
        >
          {tab.label}
          {tab.contagem !== null && ` (${tab.contagem})`}
        </Link>
      ))}
    </nav>
  );
}
