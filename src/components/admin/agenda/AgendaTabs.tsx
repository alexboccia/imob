import Link from "next/link";
import { cn } from "@/lib/utils";

const ABAS = ["hoje", "proximas", "anteriores"] as const;
type Aba = (typeof ABAS)[number];

const ABA_LABEL: Record<Aba, string> = {
  hoje: "Hoje",
  proximas: "Próximas",
  anteriores: "Anteriores",
};

// Redesenho da Agenda — mesmas 3 abas de sempre (URL-driven via
// ?aba=hoje|proximas|anteriores), mesma família visual de pill de
// PipelineTabs/ClientesFiltrosEstagio (dark-ativo/claro-inativo,
// rounded-lg, mesmas cores — nenhuma cor nova). Só um pouco mais compacta
// que o padrão-base (h-7/px-2.5/gap-1.5 em vez de h-8/px-3/gap-2): a
// Agenda não tem uma segunda fileira de chips dividindo a mesma linha
// (Pipeline tem "Prioridade: Todas/Alta/Média/Normal" ao lado), então as
// 3 abas sozinhas numa fileira inteira pareciam soltas/grandes demais —
// ajuste puramente visual, mesmo mecanismo de sempre. Nenhuma lógica
// nova: `contadores` já vem calculado por contarAgenda (src/lib/agenda.ts).
export function AgendaTabs({
  abaAtual,
  contadores,
  href,
}: {
  abaAtual: Aba;
  contadores: Record<Aba, number>;
  href: (aba: Aba) => string;
}) {
  return (
    <nav className="flex flex-wrap gap-1.5" aria-label="Período da agenda">
      {ABAS.map((aba) => (
        <Link
          key={aba}
          href={href(aba)}
          aria-current={abaAtual === aba ? "page" : undefined}
          className={cn(
            "inline-flex h-7 items-center justify-center rounded-lg px-2.5 text-sm font-medium transition-colors",
            abaAtual === aba
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-muted"
          )}
        >
          {ABA_LABEL[aba]} ({contadores[aba]})
        </Link>
      ))}
    </nav>
  );
}
