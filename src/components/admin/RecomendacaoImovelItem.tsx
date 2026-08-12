"use client";

import { useActionState } from "react";
import Link from "next/link";
import { criarInteressePessoa } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { ESTAGIO_INTERESSE_LABEL } from "@/components/admin/InteresseImovelItem";
import { formatarPreco } from "@/lib/format";
import { obterProximaAcaoComercial } from "@/lib/proxima-acao-comercial";
import type { PropertyInterestStage } from "@/generated/prisma/client";
import type { CriterioMatch } from "@/lib/property-matching";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function RecomendacaoImovelItem({
  pessoaId,
  recomendacao,
}: {
  pessoaId: string;
  recomendacao: {
    score: number;
    activeSoftCriteriaCount: number;
    criteria: CriterioMatch[];
    existingInterest: { stage: PropertyInterestStage; favorited: boolean } | null;
    property: { id: string; title: string; price: unknown; rentPrice: unknown };
  };
}) {
  // buscarImoveisCompativeis só recomenda Property com status AVAILABLE
  // (pré-filtro SQL, property-matching.ts) — o imóvel deste card nunca
  // chega aqui em outro status, por isso não precisa de um propertyStatus
  // vindo de fora (property-matching.ts não expõe status em
  // PropertyParaMatching, e esta fase não altera esse arquivo).
  const proximaAcao = recomendacao.existingInterest
    ? obterProximaAcaoComercial(recomendacao.existingInterest.stage, "AVAILABLE")
    : null;
  const acao = criarInteressePessoa.bind(null, pessoaId);
  const [, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);

  // Requisitos (hard filters, weight=0) vs. Compatibilidade (soft
  // criteria, weight>0) — separados pra não sugerir que "Comprar"/"Dentro
  // do orçamento" contam ponto no percentual. Só imóveis compatible=true
  // chegam aqui, então requisitos nunca aparecem como ✕.
  const requisitos = recomendacao.criteria.filter((c) => c.active && c.weight === 0);
  const criteriosCompatibilidade = recomendacao.criteria.filter((c) => c.active && c.weight > 0);
  // Sem nenhum soft criterion avaliado, o score interno é 100 por
  // convenção (ausência de sinal negativo, não confirmação real) — a UI
  // não afirma "100% compatível" nesse caso, só "Compatível".
  const temScorePercentual = recomendacao.activeSoftCriteriaCount > 0;

  return (
    <Card>
      <CardContent className="text-sm space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{recomendacao.property.title}</p>
            <p className="text-muted-foreground">
              {formatarPreco(recomendacao.property.price ?? recomendacao.property.rentPrice)}
            </p>
          </div>
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
            href={`/app/imoveis/${recomendacao.property.id}`}
            className="text-sm text-blue-600 hover:underline"
          >
            Ver imóvel
          </Link>

          {recomendacao.existingInterest ? (
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
          ) : (
            <form action={formAction}>
              <input type="hidden" name="propertyId" value={recomendacao.property.id} />
              <Button type="submit" variant="outline" size="sm" disabled={pendente}>
                {pendente ? "Relacionando..." : "Relacionar"}
              </Button>
            </form>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
