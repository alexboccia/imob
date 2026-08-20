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
import type { ItemPipeline, PrioridadePipeline } from "@/lib/pipeline";
import { estagioInteresseEncerrado, ESTAGIO_INTERESSE_LABEL } from "@/lib/property-interest-schema";
import { acaoOperacionalDaVisita, formatarDataHora } from "@/lib/scheduled-activity-date";
import { MoverEstagioPipeline } from "@/components/admin/MoverEstagioPipeline";
import { FechamentoInteresse } from "@/components/admin/FechamentoInteresse";
import { PRIORIDADE_BADGE_CLASSE, PRIORIDADE_LABEL_CURTO, formatarMotivoPrioridade } from "./prioridade-visual";

// Redesenho do Pipeline (item 17 do pedido) — drawer da negociação aberta
// pelo botão "Abrir negociação" do card. Deliberadamente SEM fetch
// próprio: ao contrário de ClienteDrawer (que busca sob demanda contagens
// e histórico que a linha da tabela não carrega), aqui `item`+`prioridade`
// já são exatamente os mesmos dados que o card do Kanban já tinha —
// buscarPipelineAberto/buscarPipelineEncerrado (src/lib/pipeline.ts) e
// classificarPrioridadePipeline (page.tsx) já carregaram tudo que este
// drawer mostra. Ações (mover etapa / marcar ganho / marcar perdido)
// reaproveitam MoverEstagioPipeline/FechamentoInteresse tal como são —
// nenhuma Server Action nova, nenhuma regra nova.
export function NegociacaoDrawer({
  item,
  prioridade,
  open,
  onOpenChange,
}: {
  item: ItemPipeline | null;
  prioridade?: PrioridadePipeline;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!item) return null;

  const encerrado = estagioInteresseEncerrado(item.stage);
  const pendente =
    !!item.proximaVisita &&
    acaoOperacionalDaVisita(
      { status: "SCHEDULED", scheduledAt: new Date(item.proximaVisita.scheduledAtISO) },
      new Date()
    ) === "RESOLVER_PENDENCIA";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-md">
        <SheetHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <SheetTitle>{item.person ? item.person.name : "Cliente indisponível"}</SheetTitle>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{ESTAGIO_INTERESSE_LABEL[item.stage] ?? item.stage}</Badge>
                {!encerrado && prioridade && (
                  <Badge className={PRIORIDADE_BADGE_CLASSE[prioridade.nivel]} variant="outline">
                    Prioridade {PRIORIDADE_LABEL_CURTO[prioridade.nivel]}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <SheetDescription className="sr-only">
            Detalhes da negociação {item.person ? `com ${item.person.name}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto">
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

          {!encerrado && prioridade && prioridade.motivos.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-sm font-medium">Motivos da prioridade</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {prioridade.motivos.map((motivo, i) => (
                  <li key={i}>{formatarMotivoPrioridade(motivo)}</li>
                ))}
              </ul>
            </div>
          )}

          {!encerrado && (
            <div className="space-y-1.5">
              {item.proximaAcao && (
                <div>
                  <h3 className="text-sm font-medium">Próxima ação</h3>
                  <p className={`text-sm ${item.proximaAcao.ativa ? "text-foreground" : "text-muted-foreground"}`}>
                    {item.proximaAcao.label}
                  </p>
                </div>
              )}
              {item.aging && <p className="text-xs text-muted-foreground">{item.aging}</p>}
              {item.proximaVisita ? (
                <p className={`text-sm ${pendente ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                  {pendente ? "Pendência: " : "Próxima visita: "}
                  {formatarDataHora(item.proximaVisita.scheduledAtISO)}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Sem visita agendada</p>
              )}
            </div>
          )}

          <div className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-medium">Ações</h3>
            {!encerrado && <MoverEstagioPipeline interesseId={item.id} stageAtual={item.stage} />}
            <FechamentoInteresse interesseId={item.id} stage={item.stage} closedAtISO={item.closedAtISO} />
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
