import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Estado vazio padrão do backoffice (Fase 65).
//
// Justificativa: cada bloco resolvia o vazio do seu jeito — a Central
// tinha um `Vazio` local que era só um <p> cinza, outras telas usam
// parágrafos soltos. O resultado é que "não há nada aqui" ora parece uma
// informação, ora parece um erro de carregamento.
//
// Informativo, não decorativo: ícone pequeno, título curto, uma frase de
// contexto e ação OPCIONAL. Sem ilustração — é uma tela operacional, e
// uma imagem grande só empurraria o conteúdo real para baixo.
//
// O ícone é `aria-hidden`: o título e a descrição já dizem tudo em texto.
export function EstadoVazio({
  icone: Icone,
  titulo,
  descricao,
  acao,
  className,
}: {
  icone: LucideIcon;
  titulo: ReactNode;
  descricao?: ReactNode;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-estado-vazio
      className={cn(
        "flex min-w-0 flex-col items-center gap-2 px-4 py-8 text-center",
        className
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icone aria-hidden className="size-5" />
      </span>
      <p className="min-w-0 break-words text-sm font-medium">{titulo}</p>
      {descricao && (
        <p className="min-w-0 max-w-sm break-words text-sm text-muted-foreground">{descricao}</p>
      )}
      {acao && <div className="mt-1 flex flex-wrap justify-center gap-2">{acao}</div>}
    </div>
  );
}
