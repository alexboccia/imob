"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

// =======================================================================
// Abas da tela de Configurações (Fase 61)
// =======================================================================
// A página era uma coluna vertical com tudo — identidade, contatos,
// visibilidade, fuso e código do imóvel — e ninguém achava nada.
//
// A RESTRIÇÃO QUE DEFINE ESTE COMPONENTE: Configurações é UM formulário
// só, e a Server Action grava TODOS os campos a cada salvamento. Se uma
// aba inativa fosse desmontada, seus campos sumiriam do FormData e o
// salvamento apagaria o que não estivesse na aba aberta.
//
// Por isso os painéis nunca são desmontados: todos ficam no DOM e os
// inativos são escondidos com o atributo `hidden`. Campo escondido
// continua sendo enviado pelo formulário — é exatamente esse detalhe do
// HTML que torna a divisão em abas segura aqui. Também é o que faz uma
// alteração feita numa aba sobreviver à navegação para outra.
//
// A aba escolhida vai para a URL por `history.replaceState`, e não por
// navegação do router: uma navegação re-renderizaria a página e
// descartaria o que ainda não foi salvo.

export type AbaConfiguracao = {
  id: string;
  rotulo: string;
  conteudo: ReactNode;
};

export function AbasConfiguracoes({ abas }: { abas: AbaConfiguracao[] }) {
  const parametros = useSearchParams();
  const pedida = parametros.get("tab");
  const inicial = abas.some((a) => a.id === pedida) ? (pedida as string) : abas[0].id;
  const [ativa, setAtiva] = useState(inicial);

  function abrir(id: string) {
    setAtiva(id);
    // Só a URL muda — sem navegação, sem recarregar, sem perder o que
    // está preenchido.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", id);
      window.history.replaceState(null, "", url);
    } catch {
      // URL indisponível (ambiente sem history): a aba continua
      // funcionando, só não fica registrada no endereço.
    }
  }

  return (
    <div className="min-w-0">
      {/* `overflow-x-auto` para as cinco abas caberem em 320px sem
          espremer o rótulo nem estourar a página. */}
      <div
        role="tablist"
        aria-label="Seções das configurações"
        data-abas-configuracoes
        className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 pb-1"
      >
        {abas.map((aba) => {
          const selecionada = aba.id === ativa;
          return (
            <button
              key={aba.id}
              type="button"
              role="tab"
              id={`aba-${aba.id}`}
              aria-selected={selecionada}
              aria-controls={`painel-${aba.id}`}
              // Só a aba ativa entra na ordem de tabulação; as setas
              // percorrem as demais, que é o comportamento esperado de
              // um tablist.
              tabIndex={selecionada ? 0 : -1}
              onClick={() => abrir(aba.id)}
              onKeyDown={(e) => {
                const passo = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                if (!passo) return;
                e.preventDefault();
                const i = abas.findIndex((a) => a.id === ativa);
                const proxima = abas[(i + passo + abas.length) % abas.length];
                abrir(proxima.id);
                document.getElementById(`aba-${proxima.id}`)?.focus();
              }}
              className={cn(
                "inline-flex h-9 shrink-0 items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                selecionada
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-muted"
              )}
            >
              {aba.rotulo}
            </button>
          );
        })}
      </div>

      {abas.map((aba) => (
        <div
          key={aba.id}
          role="tabpanel"
          id={`painel-${aba.id}`}
          aria-labelledby={`aba-${aba.id}`}
          data-painel={aba.id}
          // `hidden`, e não desmontagem: os campos continuam no
          // formulário e continuam sendo enviados ao salvar.
          hidden={aba.id !== ativa}
          className="mt-5 min-w-0 space-y-5"
        >
          {aba.conteudo}
        </div>
      ))}
    </div>
  );
}
