import Link from "next/link";
import type { ItemPipeline } from "@/lib/pipeline";
import { estagioInteresseEncerrado, ESTAGIO_INTERESSE_LABEL } from "@/lib/property-interest-schema";
import { acaoOperacionalDaVisita, formatarDataHora } from "@/lib/scheduled-activity-date";
import { FechamentoInteresse } from "@/components/admin/FechamentoInteresse";
import { MoverEstagioPipeline } from "@/components/admin/MoverEstagioPipeline";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Card do Kanban (Fase P.4) — 1 PropertyInterest, sempre. Reutilizado tanto
// na visão "Em andamento" (mostra próxima ação/visita + controle de
// movimentação) quanto em "Encerradas" (só leitura, via
// FechamentoInteresse, sem duplicar a lógica de exibição de Ganho/Perdido
// que o próprio componente da P.3 já resolve). Nenhuma lógica de
// tenant/Prisma aqui — os dados já chegam prontos de buscarPipelineAberto/
// buscarPipelineEncerrado (src/lib/pipeline.ts), com Person/Property
// redigidos pra null quando anômalos (nunca vaza dado de outro tenant).
export function CardPipeline({ item }: { item: ItemPipeline }) {
  const encerrado = estagioInteresseEncerrado(item.stage);
  const pendente =
    !!item.proximaVisita &&
    acaoOperacionalDaVisita(
      { status: "SCHEDULED", scheduledAt: new Date(item.proximaVisita.scheduledAtISO) },
      new Date()
    ) === "RESOLVER_PENDENCIA";

  return (
    <Card>
      <CardContent className="text-sm space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {item.person ? (
              <Link
                href={`/app/clientes/${item.person.id}`}
                className="font-medium text-blue-600 hover:underline block truncate"
              >
                {item.person.name}
              </Link>
            ) : (
              <p className="font-medium text-muted-foreground">Cliente indisponível</p>
            )}
            {item.property ? (
              <Link
                href={`/app/imoveis/${item.property.id}`}
                className="text-muted-foreground hover:underline block truncate text-xs"
              >
                {item.property.title}
              </Link>
            ) : (
              <p className="text-muted-foreground text-xs">Imóvel indisponível</p>
            )}
          </div>
          <Badge variant="secondary" className="shrink-0">
            {ESTAGIO_INTERESSE_LABEL[item.stage] ?? item.stage}
          </Badge>
        </div>

        {!encerrado && (
          <>
            {item.aging && <p className="text-xs text-muted-foreground">{item.aging}</p>}
            {item.proximaAcao && (
              <p className="text-xs text-muted-foreground">
                <span className={item.proximaAcao.ativa ? "font-medium text-foreground" : ""}>
                  {item.proximaAcao.label}
                </span>
              </p>
            )}
            {item.proximaVisita ? (
              <p className={`text-xs ${pendente ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                {pendente ? "Pendência: " : "Próxima visita: "}
                {formatarDataHora(item.proximaVisita.scheduledAtISO)}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Sem visita agendada</p>
            )}
          </>
        )}

        {!encerrado && <MoverEstagioPipeline interesseId={item.id} stageAtual={item.stage} />}

        <FechamentoInteresse interesseId={item.id} stage={item.stage} closedAtISO={item.closedAtISO} />
      </CardContent>
    </Card>
  );
}
