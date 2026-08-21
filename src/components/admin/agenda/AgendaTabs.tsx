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
// ?aba=hoje|proximas|anteriores), só com o mesmo tratamento visual de
// pill usado em PipelineTabs/ClientesFiltrosEstagio. Nenhuma lógica
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
    <nav className="flex flex-wrap gap-2" aria-label="Período da agenda">
      {ABAS.map((aba) => (
        <Link
          key={aba}
          href={href(aba)}
          aria-current={abaAtual === aba ? "page" : undefined}
          className={cn(
            "h-8 rounded-lg px-3 text-sm font-medium transition-colors",
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
