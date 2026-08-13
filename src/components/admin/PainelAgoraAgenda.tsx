import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { formatarHora } from "@/lib/scheduled-activity-date";
import type { EstadoPainelAgora } from "@/lib/scheduled-activity-date";
import type { ItemAgenda } from "@/lib/agenda";

// Painel "Agora" (Fase H.7) — bloco pequeno no topo da aba Hoje, só
// apresentação: toda a decisão de qual estado mostrar já vem pronta de
// painelAgoraDoDia (src/lib/scheduled-activity-date.ts), calculada sobre
// o conjunto VISÍVEL de "Hoje" (já filtrado pelos parâmetros H.4 — ver
// page.tsx). Nunca duplica os cards individuais: quando há pendências, só
// resume a contagem (os cards continuam aparecendo normalmente nos
// grupos Manhã/Tarde/Noite); quando há uma visita dentro da janela
// operacional (VISITA_AGORA) ou uma próxima futura (PROXIMA_VISITA),
// mostra os dados dela. Estado VAZIO não renderiza nada (a página já
// mostra "Nenhuma visita agendada para hoje" nesse caso).

// Bloco de cliente/imóvel/links compartilhado entre VISITA_AGORA e
// PROXIMA_VISITA — só o título acima muda entre os dois estados.
function BlocoVisita({ visita }: { visita: ItemAgenda }) {
  return (
    <>
      <p className="font-medium">
        {formatarHora(visita.scheduledAt.toISOString())}
        {visita.person ? ` · ${visita.person.name}` : ""}
      </p>
      {visita.property && <p className="text-muted-foreground">{visita.property.title}</p>}
      {(visita.person || visita.property) && (
        <div className="flex gap-3 text-xs pt-1">
          {visita.person && (
            <Link href={`/app/clientes/${visita.person.id}`} className="text-blue-600 hover:underline">
              Ver cliente
            </Link>
          )}
          {visita.property && (
            <Link href={`/app/imoveis/${visita.property.id}`} className="text-blue-600 hover:underline">
              Ver imóvel
            </Link>
          )}
        </div>
      )}
    </>
  );
}

export function PainelAgoraAgenda({ estado }: { estado: EstadoPainelAgora<ItemAgenda> }) {
  if (estado.tipo === "VAZIO") return null;

  if (estado.tipo === "AGUARDANDO_RESULTADO") {
    return (
      <Card className="mb-4">
        <CardContent className="text-sm space-y-1 py-3">
          <p className="font-semibold">Atenção</p>
          <p className="text-muted-foreground">
            {estado.quantidade === 1
              ? "1 visita aguardando resultado"
              : `${estado.quantidade} visitas aguardando resultado`}
            <span className="text-xs">
              {" "}
              (mais antiga: {formatarHora(estado.maisAntiga.scheduledAt.toISOString())})
            </span>
          </p>
        </CardContent>
      </Card>
    );
  }

  if (estado.tipo === "VISITA_AGORA") {
    return (
      <Card className="mb-4">
        <CardContent className="text-sm space-y-1 py-3">
          <p className="font-semibold">Visita agora</p>
          <BlocoVisita visita={estado.visita} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-4">
      <CardContent className="text-sm space-y-1 py-3">
        <p className="font-semibold">Agora</p>
        <p className="text-muted-foreground">Próxima visita</p>
        <BlocoVisita visita={estado.visita} />
      </CardContent>
    </Card>
  );
}
