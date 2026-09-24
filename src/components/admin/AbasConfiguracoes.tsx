"use client";

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BarraSegmentada,
  classesItemSegmentado,
} from "@/components/admin/ui/BarraSegmentada";

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
  /** Ícone da aba (lucide-react) — apoio do rótulo, nunca o substitui. */
  icone: LucideIcon;
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
      {/* Fase 63 — eram cinco botões soltos, cada um com o seu próprio
          fundo. Agora é UMA barra: a borda e o fundo pertencem ao
          contêiner, e a aba ativa é a única pastilha dentro dele. Lê como
          navegação secundária em vez de cinco ações independentes.
          `overflow-x-auto` continua: em 320px as cinco abas com ícone não
          cabem, e rolar a barra é melhor que esmagar os rótulos. O
          contêiner é `inline-flex` num wrapper que rola, para a borda
          acompanhar o conteúdo e não a largura da página. */}
      <BarraSegmentada
        role="tablist"
        aria-label="Seções das configurações"
        data-abas-configuracoes
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
              // Em desktop as abas dividem a largura da barra; abaixo
              // disso cada uma fica no seu tamanho e a barra rola.
              className={classesItemSegmentado(selecionada, "lg:flex-1")}
            >
              {/* O ícone herda a cor do texto — apoia o rótulo, não compete. */}
              <aba.icone aria-hidden className="size-4 shrink-0" />
              {aba.rotulo}
            </button>
          );
        })}
      </BarraSegmentada>

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
