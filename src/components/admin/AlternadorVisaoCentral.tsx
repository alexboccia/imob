import Link from "next/link";
import { UserRound, Users } from "lucide-react";
import {
  BarraSegmentada,
  classesItemSegmentado,
} from "@/components/admin/ui/BarraSegmentada";

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
  { chave: "pessoal" as const, rotulo: "Meu trabalho", href: "/app", icone: UserRound },
  { chave: "equipe" as const, rotulo: "Equipe", href: "/app?visao=equipe", icone: Users },
];

export function AlternadorVisaoCentral({
  visaoAtual,
}: {
  visaoAtual: "pessoal" | "equipe";
}) {
  return (
    // Fase 65 — só a APARÊNCIA passou a ser a da barra segmentada do
    // backoffice. A semântica continua exatamente a mesma: `tablist`
    // seria mentira, porque não há painéis alternados no cliente — são
    // navegações resolvidas no servidor por `?visao=`. `nav` +
    // aria-current é a semântica honesta, e o leitor de tela anuncia qual
    // está ativa sem depender de cor.
    <BarraSegmentada
      role="navigation"
      aria-label="Visão da central"
      data-visao-central
    >
      {OPCOES.map((opcao) => {
        const ativa = opcao.chave === visaoAtual;
        return (
          <Link
            key={opcao.chave}
            href={opcao.href}
            aria-current={ativa ? "page" : undefined}
            className={classesItemSegmentado(ativa)}
          >
            <opcao.icone aria-hidden className="size-4 shrink-0" />
            {opcao.rotulo}
            {/* Estado em TEXTO, não só em cor/preenchimento. */}
            {ativa && <span className="sr-only"> (visão atual)</span>}
          </Link>
        );
      })}
    </BarraSegmentada>
  );
}
