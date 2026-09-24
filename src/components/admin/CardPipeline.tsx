"use client";

import { formatarPreco } from "@/lib/format";
import { LADO_PROPOSTA_LABEL } from "@/lib/proposta-negociacao";
import { useState } from "react";
import type { ItemPipeline, PrioridadePipeline } from "@/lib/pipeline";
import { estagioInteresseEncerrado } from "@/lib/property-interest-schema";
import { acaoOperacionalDaVisita } from "@/lib/scheduled-activity-date";
import { formatarDataHoraNoFuso } from "@/lib/fuso-horario";
import { FechamentoInteresse } from "@/components/admin/FechamentoInteresse";
import { ResponsavelNegociacao } from "@/components/admin/ResponsavelNegociacao";
import type { OpcaoResponsavel } from "@/lib/responsavel-negociacao";
import { MoverEstagioPipeline } from "@/components/admin/MoverEstagioPipeline";
import { NegociacaoDrawer } from "@/components/admin/pipeline/NegociacaoDrawer";
import { PRIORIDADE_BADGE_CLASSE, PRIORIDADE_LABEL_CURTO } from "@/components/admin/pipeline/prioridade-visual";
import { TIPO_ATIVIDADE_LABEL } from "@/lib/follow-up";
import { AlertTriangle, MapPin } from "lucide-react";
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
export function CardPipeline({
  item,
  prioridade,
  membros,
  fuso,
}: {
  item: ItemPipeline;
  prioridade?: PrioridadePipeline;
  // Fuso comercial da organização (Fase 18) — carregado UMA vez pela
  // página e repassado, igual a `membros`. Nunca uma consulta por card.
  fuso: string;
  // Fase 11 — membros ativos, carregados UMA vez pela página do Pipeline
  // e repassados a todos os cards. Nunca uma query por card.
  membros: OpcaoResponsavel[];
}) {
  const [drawerAberto, setDrawerAberto] = useState(false);
  const encerrado = estagioInteresseEncerrado(item.stage);
  const pendente =
    !!item.proximoCompromisso &&
    acaoOperacionalDaVisita(
      { status: "SCHEDULED", scheduledAt: new Date(item.proximoCompromisso.scheduledAtISO) },
      fuso,
      new Date()
    ) === "RESOLVER_PENDENCIA";

  return (
    <>
      <Card size="sm" className="min-w-0">
        <CardContent className="space-y-2 text-sm">
          {/* IDENTIDADE — cliente e prioridade na mesma linha; o imóvel e
              o bairro logo abaixo, com o bairro marcado por ícone de
              lugar para deixar de ser mais uma linha cinza igual às
              outras. Sem miniatura do imóvel: o DTO do Pipeline
              (ItemPipeline.property) não traz mídia, e acrescentá-la
              exigiria mexer na camada de dados só por estética. */}
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              {item.person ? (
                <p className="truncate font-medium">{item.person.name}</p>
              ) : (
                <p className="truncate font-medium text-muted-foreground">Cliente indisponível</p>
              )}
              {item.property ? (
                <>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {item.property.title}
                  </p>
                  {item.property.neighborhood && (
                    <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      <MapPin aria-hidden className="size-3 shrink-0" />
                      <span className="truncate">{item.property.neighborhood}</span>
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-0.5 text-xs text-muted-foreground">Imóvel indisponível</p>
              )}
            </div>
            {!encerrado && prioridade && prioridade.nivel !== "NORMAL" && (
              <Badge className={`shrink-0 ${PRIORIDADE_BADGE_CLASSE[prioridade.nivel]}`} variant="outline">
                {PRIORIDADE_LABEL_CURTO[prioridade.nivel]}
              </Badge>
            )}
          </div>

          {!encerrado && (
            <div className="space-y-1.5 border-t pt-2">
              {/* PRÓXIMA AÇÃO — rotulada e destacada: é a informação que o
                  corretor procura primeiro, e antes era só mais uma linha
                  de 12px igual às vizinhas. O texto e a regra de `ativa`
                  vêm prontos do servidor (ProximaAcaoComercial); nada é
                  inferido aqui. */}
              {item.proximaAcao && (
                <div className="min-w-0">
                  <p className="text-[11px] text-muted-foreground">Próxima ação</p>
                  <p
                    data-proxima-acao
                    className={
                      item.proximaAcao.ativa
                        ? "min-w-0 break-words text-sm font-medium text-foreground"
                        : "min-w-0 break-words text-sm text-muted-foreground"
                    }
                  >
                    {item.proximaAcao.label}
                  </p>
                </div>
              )}
              {/* Fase 33 — o valor que está na mesa. Sem ele, a coluna
                  "Proposta" era um rótulo que não dizia proposta de
                  quanto nem de quem. Uma linha só: o card continua sendo
                  um card. */}
              {item.ultimaProposta && (
                <p className="text-xs">
                  <span className="font-medium tabular-nums">
                    {formatarPreco(item.ultimaProposta.valor)}
                  </span>{" "}
                  <span className="text-muted-foreground">
                    · {LADO_PROPOSTA_LABEL[item.ultimaProposta.lado]}
                  </span>
                </p>
              )}
              {item.aging && <p className="text-xs text-muted-foreground">{item.aging}</p>}
              {item.proximoCompromisso ? (
                pendente ? (
                  // ATENÇÃO, não erro. Fase 66 — antes era text-destructive
                  // (vermelho saturado). Atraso operacional acontece todo
                  // dia; gastar o vermelho nele faz o vermelho deixar de
                  // significar alguma coisa. O tratamento âmbar é o mesmo
                  // de "Atrasadas" no Dashboard, e o estado continua dito
                  // em TEXTO, nunca só por cor. A REGRA que define o
                  // atraso (acaoOperacionalDaVisita) não mudou.
                  <div
                    data-pendencia
                    className="flex min-w-0 items-start gap-2 rounded-lg border border-orange-200 bg-orange-50/60 p-2"
                  >
                    <AlertTriangle
                      aria-hidden
                      className="mt-0.5 size-3.5 shrink-0 text-orange-700"
                    />
                    <div className="min-w-0">
                      {/* Fase 19 — o tipo aparece em TEXTO: o card pode
                          estar mostrando uma visita ou um follow-up. */}
                      <p className="min-w-0 break-words text-xs font-medium">
                        {TIPO_ATIVIDADE_LABEL[item.proximoCompromisso.tipo]} atrasad
                        {item.proximoCompromisso.tipo === "VISIT" ? "a" : "o"}
                        {item.proximoCompromisso.assunto &&
                          ` — ${item.proximoCompromisso.assunto}`}
                      </p>
                      <p className="min-w-0 break-words text-xs text-muted-foreground tabular-nums">
                        {formatarDataHoraNoFuso(item.proximoCompromisso.scheduledAtISO, fuso)}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="min-w-0 break-words text-xs text-muted-foreground">
                    Próximo: {TIPO_ATIVIDADE_LABEL[item.proximoCompromisso.tipo]}
                    {item.proximoCompromisso.assunto && ` — ${item.proximoCompromisso.assunto}`}
                    {" · "}
                    {formatarDataHoraNoFuso(item.proximoCompromisso.scheduledAtISO, fuso)}
                  </p>
                )
              ) : (
                <p className="text-xs text-muted-foreground">Sem compromisso agendado</p>
              )}
            </div>
          )}

          {/* Fase 11 — ownership visível no card, em TEXTO. O card já é
              denso, então é uma linha discreta acima do bloco de ações,
              nunca um avatar solto que só faria sentido para quem
              reconhece a foto. */}
          <div className="border-t pt-2">
            <ResponsavelNegociacao
              interesseId={item.id}
              responsavel={item.responsavel}
              membros={membros}
              encerrada={encerrado}
            />
          </div>

          {encerrado ? (
            <div className="border-t pt-2">
              <FechamentoInteresse
                fuso={fuso}
                interesseId={item.id}
                stage={item.stage}
                closedAtISO={item.closedAtISO}
                closedValue={item.closedValue}
                purpose={item.property?.purpose ?? "SALE"}
                propertyStatus={item.property?.status ?? "AVAILABLE"}
                lostReason={item.lostReason}
                commissionValue={item.commissionValue}
                // Fase 14 — num negócio encerrado a ÚLTIMA transição é
                // exatamente o fechamento, então o ator já carregado
                // serve sem nenhuma query extra.
                atorFechamento={item.atorUltimaTransicao}
                imovelTitulo={item.property?.title}
                clienteNome={item.person?.name}
              />
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
        <NegociacaoDrawer
          item={item}
          prioridade={prioridade}
          fuso={fuso}
          open={drawerAberto}
          onOpenChange={setDrawerAberto}
        />
      )}
    </>
  );
}
