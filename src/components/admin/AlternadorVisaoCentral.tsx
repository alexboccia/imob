import Link from "next/link";
import { cn } from "@/lib/utils";

// Alternador Meu trabalho / Equipe (Fase 21).
//
// Links, não botões com estado de cliente: a visão é URL-driven
// (`?visao=equipe`), então ela é compartilhável, sobrevive a recarga e —
// o que mais importa — é o SERVIDOR que decide o que entregar. Este
// componente nem sequer é renderizado para quem não tem autoridade
// gerencial.
//
// Nenhuma rota nova: é a mesma Central, o mesmo `/app`.
const OPCOES = [
  { chave: "pessoal" as const, rotulo: "Meu trabalho", href: "/app" },
  { chave: "equipe" as const, rotulo: "Equipe", href: "/app?visao=equipe" },
];

export function AlternadorVisaoCentral({
  visaoAtual,
}: {
  visaoAtual: "pessoal" | "equipe";
}) {
  return (
    // `tablist` seria mentira: não há painéis alternados no cliente, são
    // navegações. `nav` + aria-current é a semântica honesta, e o leitor
    // de tela anuncia qual está ativa sem depender de cor.
    <nav aria-label="Visão da central" className="flex flex-wrap gap-2">
      {OPCOES.map((opcao) => {
        const ativa = opcao.chave === visaoAtual;
        return (
          <Link
            key={opcao.chave}
            href={opcao.href}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ativa
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input text-muted-foreground hover:bg-muted"
            )}
          >
            {opcao.rotulo}
            {/* Estado em TEXTO, não só em cor/preenchimento. */}
            {ativa && <span className="sr-only"> (visão atual)</span>}
          </Link>
        );
      })}
    </nav>
  );
}
