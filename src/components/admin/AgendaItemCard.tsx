"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AgendaDetalhesDrawer } from "@/components/admin/agenda/AgendaDetalhesDrawer";
import {
  STATUS_VISITA_LABEL,
  ACAO_OPERACIONAL_LABEL,
  type ItemAgendaClient,
} from "@/components/admin/agenda/agenda-visual";
import {
  formatarDataHora,
  estaAtrasada,
  horarioJaPassouHoje,
  acaoOperacionalDaVisita,
} from "@/lib/scheduled-activity-date";
import { cn } from "@/lib/utils";
import { CalendarCheck } from "lucide-react";

// Redesenho da Agenda — card compacto, consistente com o visual do
// CRM de Clientes/Pipeline (Card branco, badges discretos, ações
// movidas pro drawer "Ver detalhes"). Continua 1 ScheduledActivity(VISIT),
// sem I/O/Prisma próprio — os dados já chegam prontos de
// buscarAgendaHoje/Proximas/Anteriores (src/lib/agenda.ts). Virou Client
// Component (era Server Component antes do redesenho) só pra guardar o
// estado local de "drawer aberto" — mesmo racional de CardPipeline no
// redesenho do Pipeline: cada card é dono do próprio drawer, sem estado
// compartilhado.
//
// `item`/`agoraISO` cruzam a fronteira Server -> Client como ISO string
// (nunca Date bruto) — mesmo padrão defensivo de CardPipeline.tsx, ver
// ItemAgendaClient em agenda-visual.ts.
export function AgendaItemCard({
  item,
  agoraISO,
  ehProximaVisita = false,
}: {
  item: ItemAgendaClient;
  agoraISO: string;
  ehProximaVisita?: boolean;
}) {
  const [drawerAberto, setDrawerAberto] = useState(false);
  const agora = new Date(agoraISO);
  const scheduledAt = new Date(item.scheduledAtISO);
  const acionavel = item.status === "SCHEDULED";
  const atrasada = acionavel && estaAtrasada({ status: item.status, scheduledAt }, agora);
  const horarioPassou = horarioJaPassouHoje({ status: item.status, scheduledAt }, agora);
  const acaoOperacional = acionavel
    ? acaoOperacionalDaVisita({ status: item.status, scheduledAt }, agora)
    : null;

  return (
    <>
      <Card
        size="sm"
        className={cn("min-w-0", ehProximaVisita && "border-primary ring-1 ring-primary")}
      >
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">{formatarDataHora(item.scheduledAtISO)}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <CalendarCheck className="size-3.5 shrink-0" />
                Visita
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              {ehProximaVisita && (
                <Badge variant="default" className="text-[10px]">
                  Próxima
                </Badge>
              )}
              {atrasada && (
                <Badge variant="destructive" className="text-[10px]">
                  Atrasada
                </Badge>
              )}
              {horarioPassou && (
                <Badge variant="outline" className="text-[10px]">
                  Horário passou
                </Badge>
              )}
              <Badge variant="secondary">{STATUS_VISITA_LABEL[item.status] ?? item.status}</Badge>
            </div>
          </div>

          <div className="border-t pt-2">
            <p className="truncate font-medium">{item.person ? item.person.name : "Cliente indisponível"}</p>
            {item.property ? (
              <>
                <p className="truncate text-xs text-muted-foreground">{item.property.title}</p>
                <p className="truncate text-xs text-muted-foreground">{item.property.neighborhood}</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Imóvel indisponível</p>
            )}
          </div>

          {acaoOperacional && (
            <p className="text-xs font-medium text-primary">{ACAO_OPERACIONAL_LABEL[acaoOperacional]}</p>
          )}

          <div className="border-t pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDrawerAberto(true)}>
              Ver detalhes
            </Button>
          </div>
        </CardContent>
      </Card>

      <AgendaDetalhesDrawer item={item} agoraISO={agoraISO} open={drawerAberto} onOpenChange={setDrawerAberto} />
    </>
  );
}
