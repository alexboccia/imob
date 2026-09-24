import Link from "next/link";
import { CircleDot, CircleCheck } from "lucide-react";
import {
  BarraSegmentada,
  classesItemSegmentado,
} from "@/components/admin/ui/BarraSegmentada";
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
    {
      valor: "ABERTA" as const,
      label: "Em andamento",
      contagem: emAndamento,
      href: hrefAberta,
      icone: CircleDot,
    },
    {
      valor: "ENCERRADA" as const,
      label: "Encerradas",
      contagem: null,
      href: hrefEncerrada,
      icone: CircleCheck,
    },
  ];

  return (
    // Fase 66 — só a APARÊNCIA virou a barra segmentada do backoffice. A
    // semântica é a mesma de sempre e é a correta: são LINKS resolvidos
    // pela URL (?visao=), com os demais filtros preservados no href pelo
    // caller. Transformar em role="tablist" seria mentir — não há painéis
    // alternados no cliente, e o conteúdo vem do servidor.
    <BarraSegmentada role="navigation" aria-label="Situação da negociação">
      {tabs.map((tab) => {
        const ativa = visao === tab.valor;
        return (
          <Link
            key={tab.valor}
            href={tab.href}
            aria-current={ativa ? "page" : undefined}
            className={classesItemSegmentado(ativa)}
          >
            <tab.icone aria-hidden className="size-4 shrink-0" />
            {tab.label}
            {tab.contagem !== null && ` (${tab.contagem})`}
            {/* Estado em TEXTO, não só em cor/preenchimento. */}
            {ativa && <span className="sr-only"> (situação atual)</span>}
          </Link>
        );
      })}
    </BarraSegmentada>
  );
}
