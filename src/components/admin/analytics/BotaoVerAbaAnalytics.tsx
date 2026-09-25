"use client";

import { ArrowRight } from "lucide-react";
import { useAbrirAba } from "@/components/admin/AbasConfiguracoes";

// Ação secundária "Ver análise X →" dentro de um painel do Analytics
// (Fase 68.1) — por exemplo, do resumo da Visão geral para a aba
// Comercial completa.
//
// POR QUE NÃO É UM <Link href="/app/analytics?tab=comercial">: a página
// de Analytics é um Server Component com 12 consultas Prisma sem cache
// (ver AbasAnalytics). Uma navegação — mesmo de cliente, via next/link —
// muda `searchParams` e faz o Server Component rodar de novo, reexecutando
// as 12 consultas só para mostrar dados que já estão na tela. As abas
// existem exatamente para evitar isso.
//
// Por isso este botão usa o MESMO mecanismo que os botões de aba: chama
// `abrir(id)` via o contexto exposto por AbasConfiguracoes — nenhuma
// segunda implementação de troca de aba, e o `?tab=` na URL continua
// sendo escrito por `history.replaceState`, como sempre.
export function BotaoVerAbaAnalytics({
  aba,
  rotulo,
}: {
  /** id da aba de destino, o mesmo passado a AbasAnalytics/AbasConfiguracoes. */
  aba: string;
  rotulo: string;
}) {
  const abrir = useAbrirAba();

  // Fora de um AbasConfiguracoes (não deveria acontecer, mas sem crash):
  // não renderiza um botão morto.
  if (!abrir) return null;

  function clicar() {
    abrir!(aba);
    // Mesmo destino de foco que a navegação por setas já usa — o usuário
    // chega na aba nova com o foco em cima dela, não perdido na página.
    document.getElementById(`aba-${aba}`)?.focus();
  }

  return (
    <button
      type="button"
      onClick={clicar}
      className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {rotulo}
      <ArrowRight aria-hidden className="size-3.5" />
    </button>
  );
}
