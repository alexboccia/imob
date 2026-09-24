import type { ReactNode } from "react";

// Cabeçalho de página do backoffice (Fase 65).
//
// Justificativa da abstração: o par <h1> + subtítulo aparece hoje em 23
// páginas administrativas, cada uma repetindo as mesmas classes à mão. É
// repetição real e contada, não antecipação.
//
// `break-words` no h1 não é enfeite: em 360px a coluna real de conteúdo
// atrás da sidebar tem ~88px — menos que a largura natural de uma palavra
// como "Dashboard" em text-2xl. Sem ele a palavra vaza da caixa em vez de
// quebrar (achado medido no redesenho anterior do Dashboard, preservado
// aqui para que nenhuma página futura reintroduza o bug).
//
// `acoes` é opcional e fica à direita em desktop, empilhando em mobile —
// é onde entram os "Novo cliente", "Novo imóvel" das telas de catálogo.
export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && (
          <p className="mt-0.5 min-w-0 break-words text-sm text-muted-foreground">{descricao}</p>
        )}
      </div>
      {acoes && <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}
