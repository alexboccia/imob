"use client";

import { useActionState } from "react";
import {
  marcarInteresseComoGanho,
  marcarInteresseComoPerdido,
} from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { formatarDataHora } from "@/lib/scheduled-activity-date";
import { Button } from "@/components/ui/button";
import type { PropertyInterestStage } from "@/generated/prisma/client";

// Fechamento oficial da negociação (Fase P.3) — componente pequeno e
// burro: só decide o que renderizar a partir de stage/closedAt (já
// carregados pela página) e aciona as duas Server Actions dedicadas.
// Nenhuma lógica de tenant/Prisma aqui — quem garante isso são
// marcarInteresseComoGanho/Perdido (clientes/actions.ts). Reaproveitado
// tanto em InteresseImovelItem.tsx (ficha do cliente) quanto na seção
// "Clientes interessados" de imoveis/[id]/page.tsx (ficha do imóvel).
//
// closedAtISO é um evento real (quando a Server Action rodou new Date()),
// não um horário digitado pelo usuário como scheduledAt — mas mesmo assim
// reaproveita formatarDataHora (UTC-literal) em vez de
// `.toLocaleString("pt-BR")` puro: este é um Client Component, então o
// texto é gerado tanto no SSR quanto na hidratação no browser; sem um
// timezone fixo os dois poderiam divergir (mismatch de hidratação) se o
// processo do servidor e o navegador estiverem em fusos diferentes.
// scheduledAt já resolveu exatamente esse problema técnico — reaproveitar
// a mesma função é mais simples que inventar uma segunda estratégia só
// porque o significado semântico da data é outro.
export function FechamentoInteresse({
  interesseId,
  stage,
  closedAtISO,
}: {
  interesseId: string;
  stage: PropertyInterestStage;
  closedAtISO: string | null;
}) {
  const ganhoAcao = marcarInteresseComoGanho.bind(null, interesseId);
  const [estadoGanho, formActionGanho, pendenteGanho] = useActionState(
    ganhoAcao,
    ESTADO_INICIAL_ACAO
  );

  const perdidoAcao = marcarInteresseComoPerdido.bind(null, interesseId);
  const [estadoPerdido, formActionPerdido, pendentePerdido] = useActionState(
    perdidoAcao,
    ESTADO_INICIAL_ACAO
  );

  // stage terminal anômalo com closedAt null (linha legada de antes da
  // P.2/P.3, ou WON/REJECTED atingido por algum caminho fora destas duas
  // actions) — nunca inferir uma data a partir de updatedAt ou qualquer
  // outro campo, só omitir a linha "Fechado em".
  if (stage === "WON") {
    return (
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Ganho</span>
        {closedAtISO && <> — Fechado em {formatarDataHora(closedAtISO)}</>}
      </p>
    );
  }

  if (stage === "REJECTED") {
    return (
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Perdido</span>
        {closedAtISO && <> — Fechado em {formatarDataHora(closedAtISO)}</>}
      </p>
    );
  }

  // Qualquer outro stage é aberto por definição (estagioInteresseEncerrado
  // só é true pra WON/REJECTED, ambos já tratados acima).
  const erro = [estadoGanho, estadoPerdido].find((e) => e.message && !e.success);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <form action={formActionGanho}>
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={pendenteGanho || pendentePerdido}
        >
          {pendenteGanho ? "Salvando..." : "Marcar como ganho"}
        </Button>
      </form>
      <form action={formActionPerdido}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={pendenteGanho || pendentePerdido}
        >
          {pendentePerdido ? "Salvando..." : "Marcar como perdido"}
        </Button>
      </form>
      {erro?.message && <p className="text-xs text-destructive w-full">{erro.message}</p>}
    </div>
  );
}
