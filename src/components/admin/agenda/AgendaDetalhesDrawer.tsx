"use client";

import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  estaAtrasada,
  horarioJaPassouHoje,
  acaoOperacionalDaVisita,
} from "@/lib/scheduled-activity-date";
import { formatarDataHoraNoFuso } from "@/lib/fuso-horario";
import { AgendamentoVisita } from "@/components/admin/AgendamentoVisita";
import {
  STATUS_VISITA_LABEL,
  ACAO_OPERACIONAL_LABEL,
  TIPO_ATIVIDADE_LABEL,
  type ItemAgendaClient,
} from "./agenda-visual";
import { FollowUpAgendadoCard } from "@/components/admin/FollowUpComercial";
import { MessageCircle, Phone } from "lucide-react";

// Redesenho da Agenda (item 13 do pedido) — drawer aberto pelo botão "Ver
// detalhes" do card. Deliberadamente SEM fetch próprio: `item` já é
// exatamente o mesmo dado que o card já tinha (buscarAgendaHoje/
// Proximas/Anteriores, src/lib/agenda.ts, já carregou tudo). Ações
// (remarcar/cancelar/concluir/observação) reaproveitam AgendamentoVisita
// tal como é — mesmo componente já usado na ficha do cliente/imóvel,
// nenhuma Server Action nova, nenhuma regra nova. Ligar/WhatsApp só
// aparecem quando item.person.phone existe de verdade (mesmo padrão de
// ClienteDrawer) — nunca um botão morto.
//
// `item`/`agoraISO` recebidos como ISO string (nunca Date bruto) —
// mesmo padrão defensivo de AgendaItemCard.tsx, ver ItemAgendaClient em
// agenda-visual.ts.
export function AgendaDetalhesDrawer({
  item,
  agoraISO,
  fuso,
  open,
  onOpenChange,
}: {
  item: ItemAgendaClient | null;
  agoraISO: string;
  fuso: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item) return null;

  const agora = new Date(agoraISO);
  const scheduledAt = new Date(item.scheduledAtISO);
  const acionavel = item.status === "SCHEDULED";
  const atrasada = acionavel && estaAtrasada({ status: item.status, scheduledAt }, fuso, agora);
  const horarioPassou = horarioJaPassouHoje({ status: item.status, scheduledAt }, fuso, agora);
  const acaoOperacional = acionavel
    ? acaoOperacionalDaVisita({ status: item.status, scheduledAt }, fuso, agora)
    : null;

  const ehFollowUp = item.type === "FOLLOW_UP";
  const telefone = item.person?.phone ?? null;
  const whatsappHref = telefone ? `https://wa.me/${telefone.replace(/\D/g, "")}` : null;
  const telefoneHref = telefone ? `tel:+${telefone.replace(/\D/g, "")}` : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-md">
        <SheetHeader>
          <div className="min-w-0">
            {/* Fase 19 — o título diz o TIPO: este drawer passou a abrir
                visita e follow-up. */}
            <SheetTitle>{TIPO_ATIVIDADE_LABEL[item.type]}</SheetTitle>
            {ehFollowUp && item.subject && (
              <p className="mt-1 min-w-0 break-words text-sm font-medium">{item.subject}</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary">{STATUS_VISITA_LABEL[item.status] ?? item.status}</Badge>
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
            </div>
          </div>
          <SheetDescription className="sr-only">
            Detalhes do compromisso {item.person ? `com ${item.person.name}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto">
          <div>
            <h3 className="mb-1.5 text-sm font-medium">Data e horário</h3>
            <p className="text-sm text-muted-foreground">{formatarDataHoraNoFuso(item.scheduledAtISO, fuso)}</p>
          </div>

          {acaoOperacional && (
            <p className="text-sm font-medium text-primary">{ACAO_OPERACIONAL_LABEL[acaoOperacional]}</p>
          )}

          <div>
            <h3 className="mb-1.5 text-sm font-medium">Cliente</h3>
            {item.person ? (
              <>
                <Link href={`/app/clientes/${item.person.id}`} className="font-medium text-blue-600 hover:underline">
                  {item.person.name}
                </Link>
                {telefone && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <a
                      href={whatsappHref ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs hover:bg-muted"
                    >
                      <MessageCircle className="size-3.5" />
                      WhatsApp
                    </a>
                    <a
                      href={telefoneHref ?? undefined}
                      className="flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs hover:bg-muted"
                    >
                      <Phone className="size-3.5" />
                      Ligar
                    </a>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Cliente indisponível</p>
            )}
          </div>

          {/* Fase 19 — bloco específico de VISITA: um follow-up pertence
              à negociação (e portanto a um imóvel), mas o imóvel não é o
              objeto do compromisso. Mostrar "Imóvel" com o mesmo destaque
              num follow-up de "cobrar documentos" seria mostrar campo de
              visita onde não cabe. O caminho para o imóvel continua
              existindo pela ficha do cliente. */}
          {!ehFollowUp && (
          <div>
            <h3 className="mb-1.5 text-sm font-medium">Imóvel</h3>
            {item.property ? (
              <>
                <Link href={`/app/imoveis/${item.property.id}`} className="font-medium text-blue-600 hover:underline">
                  {item.property.title}
                </Link>
                <p className="text-sm text-muted-foreground">{item.property.neighborhood}</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Imóvel indisponível</p>
            )}
          </div>
          )}

          {/* Observação: só leitura aqui quando NÃO acionável — quando
              acionável, a mesma observação já vem editável dentro de
              AgendamentoVisita logo abaixo (mesma regra de AgendaItemCard
              original, preservada). */}
          {!acionavel && item.notes && (
            <div>
              <h3 className="mb-1.5 text-sm font-medium">Observações</h3>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{item.notes}</p>
            </div>
          )}

          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">Ações</h3>
            {/* Fase 19 — as ações são as do TIPO. Um follow-up nunca
                atravessa o caminho da visita (que criaria Interaction
                VISIT e moveria o stage); as Server Actions recusam isso
                de qualquer forma, mas a UI também não oferece. */}
            {!acionavel ? (
              <p className="text-sm text-muted-foreground">
                Este compromisso já está{" "}
                {item.status === "COMPLETED" ? "concluído" : "cancelado"} — sem ações disponíveis.
              </p>
            ) : ehFollowUp ? (
              <FollowUpAgendadoCard
                fuso={fuso}
                followUp={{
                  id: item.id,
                  // subject é obrigatório em regra de aplicação para
                  // FOLLOW_UP; o fallback existe só para não quebrar a
                  // tela diante de uma linha anômala.
                  assunto: item.subject ?? "Follow-up",
                  scheduledAtISO: item.scheduledAtISO,
                  notes: item.notes,
                }}
              />
            ) : (
              <AgendamentoVisita
                fuso={fuso}
                podeAgendar={false}
                atividadeAgendada={{
                  id: item.id,
                  scheduledAtISO: item.scheduledAtISO,
                  notes: item.notes,
                }}
              />
            )}
          </div>
        </div>

        {item.person && (
          <Button render={<Link href={`/app/clientes/${item.person.id}`} />} nativeButton={false} className="w-full">
            Ver ficha do cliente
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}
