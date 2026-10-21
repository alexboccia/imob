"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { SECOES_IMOVEL } from "@/lib/imovel-navegacao";
import { rolarParaSecaoImovel } from "@/lib/scroll-secao";

// Redesign da tela de edição de imóvel — barra de navegação horizontal
// (substitui o menu vertical secundário, item 1 do protótipo aprovado).
// NUNCA abas: todas as 7 seções continuam montadas na página o tempo
// todo (nenhum campo é desmontado/reinicializado ao navegar) — isto só
// rola até a seção e destaca o item correspondente.
//
// `IntersectionObserver` em vez de `scroll` + `getBoundingClientRect`:
// não dispara a cada pixel rolado (sem custo de performance numa
// página com 7+ seções grandes), e já relata "quem está visível agora"
// nativamente. `rootMargin` negativo no topo compensa a barra sticky —
// sem isso, a seção só "ativa" quando seu topo already passou por BAIXO
// da barra, deixando um intervalo onde nenhum item (ou o errado) fica
// marcado.
export function NavegacaoHorizontalImovel() {
  const [ativaId, setAtivaId] = useState<string>(SECOES_IMOVEL[0].id);
  // Rolagem por CLIQUE marca a seção na hora, sem esperar o
  // IntersectionObserver (que tem uma folga perceptível durante a
  // animação suave) — e ignora atualizações do observer até a rolagem
  // terminar, pra não "roubar" o destaque de volta pra seção anterior
  // no meio do caminho.
  const navegandoPorCliqueRef = useRef(false);

  useEffect(() => {
    // A seção "atual" é a última, na ordem do documento, cujo topo já
    // cruzou a linha de ativação (logo abaixo da barra sticky) — regra
    // posicional clássica de scrollspy, recalculada a partir da posição
    // REAL de todas as 7 seções a cada evento de scroll (via rAF, para
    // não rodar a cada pixel).
    //
    // Chegou-se aqui depois de uma tentativa com `IntersectionObserver`
    // (escolhendo a seção de maior `intersectionRatio` entre os
    // `entries` de cada callback): seções curtas (ex. Características,
    // ~140px) cruzam muito mais limiares de `threshold` ao atravessar a
    // zona de ativação do que uma seção alta (ex. Fotos, >1000px, cuja
    // razão de interseção nunca passa de ~0.3) — o destaque ficava preso
    // na última seção curta a disparar um callback, mesmo depois de a
    // rolagem suave já ter terminado sobre a seção seguinte, porque
    // nenhum novo callback chegava a disparar para corrigi-lo (bug real,
    // confirmado com Playwright). Ouvir o scroll em si garante que o
    // recálculo final sempre reflete a posição de repouso.
    const LINHA_ATIVACAO_PX = 130;
    let quadroAgendado = false;
    function recalcular() {
      quadroAgendado = false;
      if (navegandoPorCliqueRef.current) return;
      let atual: (typeof SECOES_IMOVEL)[number]["id"] = SECOES_IMOVEL[0].id;
      for (const secao of SECOES_IMOVEL) {
        const el = document.getElementById(secao.id);
        if (el && el.getBoundingClientRect().top <= LINHA_ATIVACAO_PX) {
          atual = secao.id;
        }
      }
      setAtivaId(atual);
    }
    function agendarRecalculo() {
      if (quadroAgendado) return;
      quadroAgendado = true;
      requestAnimationFrame(recalcular);
    }

    recalcular();
    window.addEventListener("scroll", agendarRecalculo, { passive: true });
    window.addEventListener("resize", agendarRecalculo);
    return () => {
      window.removeEventListener("scroll", agendarRecalculo);
      window.removeEventListener("resize", agendarRecalculo);
    };
  }, []);

  function irPara(id: string) {
    navegandoPorCliqueRef.current = true;
    setAtivaId(id);
    rolarParaSecaoImovel(id);
    // Tempo generoso pro scroll suave terminar antes de devolver o
    // controle ao IntersectionObserver — mesma ordem de grandeza de
    // outras transições desta base de código.
    window.setTimeout(() => {
      navegandoPorCliqueRef.current = false;
    }, 700);
  }

  return (
    <nav
      aria-label="Seções do formulário do imóvel"
      className="sticky top-0 z-30 -mx-1 overflow-x-auto border-b border-border bg-background px-1 py-2"
    >
      <ul className="flex min-w-max items-center gap-2.5">
        {SECOES_IMOVEL.map((secao) => {
          const ativa = secao.id === ativaId;
          return (
            <li key={secao.id}>
              <button
                type="button"
                aria-current={ativa ? "true" : undefined}
                onClick={() => irPara(secao.id)}
                className={cn(
                  // Azul explícito (não `bg-primary`): o token `primary`
                  // deste tema é preto/grayscale (usado nos botões de
                  // ação), não a cor de marca azul do protótipo — mesmo
                  // achado já feito no avatar da ficha do cliente.
                  "inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                  ativa
                    ? "border-transparent bg-blue-600 text-white"
                    : "border-border bg-muted text-foreground hover:bg-muted/70"
                )}
              >
                <secao.icone className="size-4" aria-hidden />
                {secao.rotulo}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
