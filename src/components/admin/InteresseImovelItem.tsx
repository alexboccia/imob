"use client";

import { useActionState, useId } from "react";
import Link from "next/link";
import {
  atualizarEstagioInteresse,
  alternarFavoritoInteresse,
  removerInteresse,
} from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { formatarPreco } from "@/lib/format";
import { obterProximaAcaoComercial } from "@/lib/proxima-acao-comercial";
import { AgendamentoVisita } from "@/components/admin/AgendamentoVisita";
import type { PropertyInterestStage, PropertyStatus } from "@/generated/prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const ESTAGIO_INTERESSE_LABEL: Record<string, string> = {
  INTERESTED: "Interessado",
  VISIT_SCHEDULED: "Visita agendada",
  VISITED: "Visitado",
  PROPOSAL: "Proposta",
  REJECTED: "Descartado",
};

export function InteresseImovelItem({
  interesse,
}: {
  interesse: {
    id: string;
    stage: PropertyInterestStage;
    favorited: boolean;
    notes: string | null;
    property: { id: string; title: string; price: unknown; rentPrice: unknown; status: PropertyStatus };
    // Visita SCHEDULED mais próxima deste relacionamento, se houver — já
    // vem pronta da query da página (batch, sem N+1 por card). scheduledAt
    // trafega como string ISO, nunca Date (ver AgendamentoVisita.tsx).
    proximaVisita: { id: string; scheduledAtISO: string; notes: string | null } | null;
  };
}) {
  const proximaAcao = obterProximaAcaoComercial(interesse.stage, interesse.property.status);
  // Agendar visita continua permitido pra VISITED/PROPOSAL (múltiplas
  // visitas foram aprovadas estruturalmente na H.1 — ver AGENTS.md da
  // H.2, decisão #8) mesmo que a "próxima ação" da Fase G já tenha
  // avançado pra outro texto; só REJECTED bloqueia, e só quando não há
  // visita SCHEDULED em aberto (uma nova só faz sentido depois que a
  // anterior foi concluída/cancelada).
  const podeAgendarVisita = interesse.stage !== "REJECTED" && interesse.property.status === "AVAILABLE";
  const atualizarAcao = atualizarEstagioInteresse.bind(null, interesse.id);
  const [estadoEstagio, formActionEstagio, pendenteEstagio] = useActionState(
    atualizarAcao,
    ESTADO_INICIAL_ACAO
  );

  const favoritarAcao = alternarFavoritoInteresse.bind(null, interesse.id);
  const [, formActionFavorito, pendenteFavorito] = useActionState(
    favoritarAcao,
    ESTADO_INICIAL_ACAO
  );

  const removerAcao = removerInteresse.bind(null, interesse.id);
  const [, formActionRemover, pendenteRemover] = useActionState(
    removerAcao,
    ESTADO_INICIAL_ACAO
  );

  const stageId = useId();
  const notesId = useId();

  return (
    <Card>
      <CardContent className="text-sm space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{interesse.property.title}</p>
            <p className="text-muted-foreground">
              {formatarPreco(interesse.property.price ?? interesse.property.rentPrice)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              {ESTAGIO_INTERESSE_LABEL[interesse.stage] ?? interesse.stage}
            </Badge>
            <form action={formActionFavorito}>
              <Button type="submit" variant="ghost" size="sm" disabled={pendenteFavorito}>
                {interesse.favorited ? "★ Favoritado" : "☆ Favoritar"}
              </Button>
            </form>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Próxima ação:{" "}
          <span className={proximaAcao.ativa ? "font-medium text-foreground" : ""}>
            {proximaAcao.label}
          </span>
        </p>

        <AgendamentoVisita
          propertyInterestId={interesse.id}
          podeAgendar={podeAgendarVisita}
          atividadeAgendada={interesse.proximaVisita}
        />

        <form action={formActionEstagio} className="flex flex-wrap items-center gap-2">
          <Label htmlFor={stageId} className="sr-only">
            Estágio
          </Label>
          {/* key={interesse.stage}: força o React a remontar o Select
              quando o stage muda por uma via diferente deste próprio form
              (ex: AgendamentoVisita avançando INTERESTED → VISIT_SCHEDULED
              automaticamente na H.2) — sem isso, o defaultValue de um
              componente uncontrolled não se atualiza sozinho, e o
              corretor poderia clicar "Salvar" e regredir o stage sem
              perceber, mesmo sem tocar no dropdown. */}
          <Select key={interesse.stage} name="stage" defaultValue={interesse.stage}>
            <SelectTrigger id={stageId} className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ESTAGIO_INTERESSE_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor={notesId} className="sr-only">
            Observações
          </Label>
          <Textarea
            id={notesId}
            name="notes"
            defaultValue={interesse.notes ?? ""}
            placeholder="Observações"
            className="flex-1 min-w-[160px]"
            rows={1}
          />
          <Button type="submit" variant="outline" size="sm" disabled={pendenteEstagio}>
            {pendenteEstagio ? "Salvando..." : "Salvar"}
          </Button>
          {estadoEstagio.message && !estadoEstagio.success && (
            <p className="text-xs text-destructive w-full">{estadoEstagio.message}</p>
          )}
        </form>

        <div className="flex items-center justify-between">
          <Link
            href={`/app/imoveis/${interesse.property.id}`}
            className="text-sm text-blue-600 hover:underline"
          >
            Ver imóvel
          </Link>
          <form action={formActionRemover}>
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={pendenteRemover}
            >
              Remover
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  );
}
