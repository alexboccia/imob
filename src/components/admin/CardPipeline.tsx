"use client";

import { useState } from "react";
import type { ItemPipeline, PrioridadePipeline } from "@/lib/pipeline";
import { estagioInteresseEncerrado } from "@/lib/property-interest-schema";
import { acaoOperacionalDaVisita, formatarDataHora } from "@/lib/scheduled-activity-date";
import { FechamentoInteresse } from "@/components/admin/FechamentoInteresse";
import { MoverEstagioPipeline } from "@/components/admin/MoverEstagioPipeline";
import { NegociacaoDrawer } from "@/components/admin/pipeline/NegociacaoDrawer";
import { PRIORIDADE_BADGE_CLASSE, PRIORIDADE_LABEL_CURTO } from "@/components/admin/pipeline/prioridade-visual";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// Redesenho do Pipeline — card do Kanban compacto, consistente com o
// visual do CRM de Clientes (Card branco, badges discretos, bastante
// espaço em branco). Continua 1 PropertyInterest, sem I/O/Prisma próprio
// — os dados já chegam prontos de buscarPipelineAberto/
// buscarPipelineEncerrado, `prioridade` já calculada em page.tsx (Fase
// P.8). Virou Client Component (era Server Component antes do redesenho)
// só pra guardar o estado local de "drawer aberto" — cada card é dono do
// seu próprio NegociacaoDrawer, sem estado compartilhado entre cards
// (diferente do padrão de ClientesTabelaComDrawer, que precisa de um
// drawer único e compartilhado por uma tabela paginada; aqui não há
// tabela, cada card já é uma unidade independente).
export function CardPipeline({ item, prioridade }: { item: ItemPipeline; prioridade?: PrioridadePipeline }) {
  const [drawerAberto, setDrawerAberto] = useState(false);
  const encerrado = estagioInteresseEncerrado(item.stage);
  const pendente =
    !!item.proximaVisita &&
    acaoOperacionalDaVisita(
      { status: "SCHEDULED", scheduledAt: new Date(item.proximaVisita.scheduledAtISO) },
      new Date()
    ) === "RESOLVER_PENDENCIA";

  return (
    <>
      <Card size="sm" className="min-w-0">
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {item.person ? (
                <p className="truncate font-medium">{item.person.name}</p>
              ) : (
                <p className="truncate font-medium text-muted-foreground">Cliente indisponível</p>
              )}
              {item.property ? (
                <>
                  <p className="truncate text-xs text-muted-foreground">{item.property.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.property.neighborhood}</p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Imóvel indisponível</p>
              )}
            </div>
            {!encerrado && prioridade && prioridade.nivel !== "NORMAL" && (
              <Badge className={`shrink-0 ${PRIORIDADE_BADGE_CLASSE[prioridade.nivel]}`} variant="outline">
                {PRIORIDADE_LABEL_CURTO[prioridade.nivel]}
              </Badge>
            )}
          </div>

          {!encerrado && (
            <div className="space-y-1 border-t pt-2">
              {item.proximaAcao && (
                <p className="text-xs">
                  <span className={item.proximaAcao.ativa ? "font-medium text-foreground" : "text-muted-foreground"}>
                    {item.proximaAcao.label}
                  </span>
                </p>
              )}
              {item.aging && <p className="text-xs text-muted-foreground">{item.aging}</p>}
              {item.proximaVisita ? (
                <p className={`text-xs ${pendente ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                  {pendente ? "Pendência: " : "Próxima visita: "}
                  {formatarDataHora(item.proximaVisita.scheduledAtISO)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Sem visita agendada</p>
              )}
            </div>
          )}

          {encerrado ? (
            <div className="border-t pt-2">
              <FechamentoInteresse interesseId={item.id} stage={item.stage} closedAtISO={item.closedAtISO} />
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setDrawerAberto(true)}>
                Abrir negociação
              </Button>
              <MoverEstagioPipeline interesseId={item.id} stageAtual={item.stage} />
            </div>
          )}
        </CardContent>
      </Card>

      {!encerrado && (
        <NegociacaoDrawer item={item} prioridade={prioridade} open={drawerAberto} onOpenChange={setDrawerAberto} />
      )}
    </>
  );
}
