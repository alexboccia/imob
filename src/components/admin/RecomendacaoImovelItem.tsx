"use client";

import { useActionState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Building2 } from "lucide-react";
import { criarInteressePessoa } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { ESTAGIO_INTERESSE_LABEL } from "@/lib/property-interest-schema";
import { formatarPreco } from "@/lib/format";
import { obterProximaAcaoComercial } from "@/lib/proxima-acao-comercial";
import type { PropertyInterestStage } from "@/generated/prisma/client";
import type { CriterioMatch } from "@/lib/property-matching";
import { CriteriosCompatibilidade } from "@/components/admin/CriteriosCompatibilidade";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RecomendacaoImovelItem({
  pessoaId,
  recomendacao,
  urlPublicaImovel,
  variante = "completa",
  onVerCriterios,
}: {
  pessoaId: string;
  // URL pública (site no ar) do imóvel — null só quando a organização
  // não pôde ser resolvida (guarda equivalente à de urlAnuncio em
  // imoveis/[id]/page.tsx); nesse caso o link cai de volta na rota
  // interna, nunca fica quebrado.
  urlPublicaImovel: string | null;
  // Redesenho da ficha do cliente — "compacta" é o preview resumido da
  // aba Visão geral (sem a lista completa de critérios, sem localização/
  // área): o card inteiro já existia para a aba Imóveis ("completa", o
  // default, preserva 100% do comportamento anterior).
  variante?: "completa" | "compacta";
  // Só relevante na variante compacta: troca de aba em vez de navegar,
  // porque os critérios completos vivem na aba Imóveis.
  onVerCriterios?: () => void;
  recomendacao: {
    score: number;
    activeSoftCriteriaCount: number;
    criteria: CriterioMatch[];
    existingInterest: { stage: PropertyInterestStage; favorited: boolean } | null;
    // Fase 16 — mesma razão de InteresseImovelItem: `unknown` permitia
    // Decimal cru cruzar a fronteira sem o TypeScript reclamar.
    property: {
      id: string;
      title: string;
      price: number | null;
      rentPrice: number | null;
      // Já vinham no candidato do matching (PropertyParaMatching) — só
      // não eram repassados a este componente. Nenhuma consulta nova.
      city?: string;
      neighborhood?: string;
      privateArea?: number | null;
      // Capa real do imóvel (buscarImoveisCompativeis, Fase 128) — null
      // quando o imóvel não tem nenhuma foto: o placeholder cobre esse
      // caso, nunca uma imagem inventada.
      fotoCapaUrl?: string | null;
    };
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

  // Sem nenhum soft criterion avaliado, o score interno é 100 por
  // convenção (ausência de sinal negativo, não confirmação real) — a UI
  // não afirma "100% compatível" nesse caso, só "Compatível".
  const temScorePercentual = recomendacao.activeSoftCriteriaCount > 0;

  // Localização só na variante COMPACTA (preview da Visão geral, sem
  // nenhuma lista de critérios): na variante completa (aba Imóveis),
  // cidade/bairro já aparecem dentro de "Requisitos atendidos" — fora do
  // <details> colapsado por padrão, duplicar aqui vazaria o dado que a
  // Fase 98 deliberadamente mantém escondido até expandir.
  const local =
    variante === "compacta"
      ? [recomendacao.property.neighborhood, recomendacao.property.city].filter(Boolean).join(", ")
      : "";

  return (
    <Card>
      <CardContent className="text-sm space-y-3">
        <div className="flex gap-3">
          {/* Capa real quando existe; placeholder consistente (mesma
              caixa, em todo card) quando o imóvel não tem foto — nunca
              uma imagem inventada. */}
          <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted text-muted-foreground">
            {recomendacao.property.fotoCapaUrl ? (
              <Image
                src={recomendacao.property.fotoCapaUrl}
                alt=""
                fill
                sizes="56px"
                className="object-cover"
              />
            ) : (
              <Building2 className="size-5" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{recomendacao.property.title}</p>
                {local && <p className="text-xs text-muted-foreground">{local}</p>}
                <p className="text-muted-foreground">
                  {formatarPreco(recomendacao.property.price ?? recomendacao.property.rentPrice)}
                  {/* Área só na compacta — na completa já vive dentro de
                      "Requisitos atendidos" (critério soft, Fase 98). */}
                  {variante === "compacta" && recomendacao.property.privateArea != null &&
                    ` · ${recomendacao.property.privateArea} m²`}
                </p>
              </div>
              <Badge
                variant="secondary"
                className="shrink-0 bg-success-muted text-success-muted-foreground"
              >
                {temScorePercentual ? `${recomendacao.score}% compatível` : "Compatível"}
              </Badge>
            </div>
          </div>
        </div>

        {variante === "completa" ? (
          <CriteriosCompatibilidade criteria={recomendacao.criteria} />
        ) : (
          <button
            type="button"
            onClick={onVerCriterios}
            className="text-xs text-blue-600 hover:underline"
          >
            Ver critérios atendidos
          </button>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* <Link> puro com as classes do Button (não o componente Button
              em si): Button/useButton força role="button" num elemento
              não-<button> quando usado via `render`, o que quebraria o
              contrato de acessibilidade ("Ver imóvel" continua sendo um
              link de verdade, role="link", href/target/rel checáveis
              diretamente) que testes existentes já afirmam. */}
          <Link
            href={urlPublicaImovel ?? `/app/imoveis/${recomendacao.property.id}`}
            target={urlPublicaImovel ? "_blank" : undefined}
            rel={urlPublicaImovel ? "noopener noreferrer" : undefined}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
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
