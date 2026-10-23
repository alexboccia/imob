import type { ElementType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Cabeçalho de SEÇÃO — o nível abaixo de CabecalhoPagina (Fase 65).
//
// Justificativa: o Dashboard sozinho já repetia esse par ("Visão geral" +
// "Panorama da operação imobiliária", e agora "O que precisa da sua
// atenção"), e CentralTrabalho mantinha um `TituloBloco` local pelo mesmo
// motivo. Três ocorrências na mesma tela.
//
// `nivel` existe porque a semântica não é sempre a mesma: numa página com
// <h1> no topo, uma seção é <h2>; dentro de um card que já vive sob um
// <h2>, o título do card é <h3>. O CardTitle do design system renderiza
// um <div> — sem semântica de heading —, então quem precisa de navegação
// por cabeçalho usa este componente em vez dele.
export function CabecalhoSecao({
  titulo,
  descricao,
  icone: Icone,
  acoes,
  nivel = 2,
  tom = "neutro",
  id,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  /** Ícone só quando acrescenta significado — nunca decoração. */
  icone?: LucideIcon;
  acoes?: ReactNode;
  nivel?: 2 | 3;
  /**
   * "neutro" (padrão, preto/cinza via `--primary`) é o visual de todo o
   * backoffice — `--primary` é intencionalmente grayscale aqui (só a
   * ficha pública aplica a cor de marca da imobiliária). "azul" é
   * explícito (Tailwind `blue-*`, não um token de tema) e existe só
   * para a Fase 130 (Meu perfil público), cuja referência aprovada pede
   * ícone azul sobre fundo azul-claro nos 4 cards — mesmo raciocínio já
   * aplicado ao cabeçalho/CTA da Fase 129.
   */
  tom?: "neutro" | "azul";
  /**
   * Fase 137 — id do próprio heading. Existe para os cards de Analytics
   * que já usavam `role="region" aria-labelledby="X"` apontando pro id
   * do título (CardTitle ou um <h2> avulso): ao migrar para este
   * componente, o id continua podendo ser o alvo do aria-labelledby,
   * sem quebrar a ligação ARIA que já existia.
   */
  id?: string;
}) {
  const Heading = `h${nivel}` as ElementType;

  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2.5">
        {Icone && (
          <span
            className={cn(
              "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
              tom === "azul" ? "bg-blue-100 text-blue-600" : "bg-primary-light text-primary"
            )}
          >
            <Icone aria-hidden className="size-4" />
          </span>
        )}
        <div className="min-w-0">
          <Heading
            id={id}
            className={
              nivel === 2
                ? "min-w-0 break-words text-lg font-semibold tracking-tight"
                : "min-w-0 break-words text-base font-semibold"
            }
          >
            {titulo}
          </Heading>
          {descricao && (
            <p className="mt-0.5 min-w-0 break-words text-sm text-muted-foreground">{descricao}</p>
          )}
        </div>
      </div>
      {acoes && <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}
