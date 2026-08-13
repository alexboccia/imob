"use client";

import { useActionState } from "react";
import Link from "next/link";
import { criarInteressePessoa } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { ESTAGIO_INTERESSE_LABEL } from "@/lib/property-interest-schema";
import { obterProximaAcaoComercial } from "@/lib/proxima-acao-comercial";
import type { PropertyInterestStage, PropertyStatus } from "@/generated/prisma/client";
import type { CriterioMatch } from "@/lib/property-matching";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function RecomendacaoClienteItem({
  propertyId,
  propertyStatus,
  recomendacao,
}: {
  propertyId: string;
  // Recebido da página (já carregado junto com o Property, sem query
  // extra por card) — só decide se o form de "Relacionar cliente"
  // aparece. Novo PropertyInterest só pode ser criado com imóvel
  // AVAILABLE (mesma regra aplicada server-side em criarInteressePessoa,
  // que é a fonte de verdade real; isso aqui é só refletir na UI).
  propertyStatus: PropertyStatus;
  recomendacao: {
    score: number;
    activeSoftCriteriaCount: number;
    criteria: CriterioMatch[];
    existingInterest: { stage: PropertyInterestStage; favorited: boolean } | null;
    person: { id: string; name: string };
  };
}) {
  const acao = criarInteressePessoa.bind(null, recomendacao.person.id);
  const [, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);
  const propertyDisponivel = propertyStatus === "AVAILABLE";
  const proximaAcao = recomendacao.existingInterest
    ? obterProximaAcaoComercial(recomendacao.existingInterest.stage, propertyStatus)
    : null;

  // Requisitos (hard filters, weight=0) vs. Compatibilidade (soft
  // criteria, weight>0) — mesma separação da Fase E, ver
  // RecomendacaoImovelItem.tsx.
  const requisitos = recomendacao.criteria.filter((c) => c.active && c.weight === 0);
  const criteriosCompatibilidade = recomendacao.criteria.filter((c) => c.active && c.weight > 0);
  const temScorePercentual = recomendacao.activeSoftCriteriaCount > 0;

  return (
    <Card>
      <CardContent className="text-sm space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="font-medium">{recomendacao.person.name}</p>
          <Badge variant="secondary">
            {temScorePercentual ? `${recomendacao.score}% compatível` : "Compatível"}
          </Badge>
        </div>

        {requisitos.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Requisitos atendidos</p>
            <ul className="text-sm space-y-1">
              {requisitos.map((criterio) => (
                <li key={criterio.key}>✓ {criterio.detail ?? criterio.label}</li>
              ))}
            </ul>
          </div>
        )}

        {criteriosCompatibilidade.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Compatibilidade</p>
            <ul className="text-sm space-y-1">
              {criteriosCompatibilidade.map((criterio) => (
                <li
                  key={criterio.key}
                  className={criterio.matched ? "text-foreground" : "text-muted-foreground"}
                >
                  {criterio.matched ? "✓" : "✕"} {criterio.detail ?? criterio.label}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href={`/app/clientes/${recomendacao.person.id}`}
            className="text-sm text-blue-600 hover:underline"
          >
            Ver cliente
          </Link>

          {recomendacao.existingInterest ? (
            // Relacionamento histórico nunca some, mesmo se o imóvel virou
            // indisponível depois — só o formulário de NOVO relacionamento
            // é condicionado a propertyDisponivel.
            <div className="text-sm text-muted-foreground text-right">
              <p>
                Já relacionado — {ESTAGIO_INTERESSE_LABEL[recomendacao.existingInterest.stage] ??
                  recomendacao.existingInterest.stage}
                {recomendacao.existingInterest.favorited && " ★"}
              </p>
              {proximaAcao && (
                <p className="text-xs">
                  Próxima ação:{" "}
                  <span className={proximaAcao.ativa ? "font-medium text-foreground" : ""}>
                    {proximaAcao.label}
                  </span>
                </p>
              )}
            </div>
          ) : propertyDisponivel ? (
            <form action={formAction}>
              <input type="hidden" name="propertyId" value={propertyId} />
              <Button type="submit" variant="outline" size="sm" disabled={pendente}>
                {pendente ? "Relacionando..." : "Relacionar cliente"}
              </Button>
            </form>
          ) : (
            <span className="text-sm text-muted-foreground">
              Imóvel indisponível para novo relacionamento
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
