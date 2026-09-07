import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarDataHora, formatarHora } from "@/lib/scheduled-activity-date";
import { ESTAGIO_INTERESSE_LABEL } from "@/lib/property-interest-schema";
import type { CentralTrabalho as DadosCentral, CompromissoCentral } from "@/lib/central-trabalho";

// Central de trabalho (Fase 17) — a camada operacional da Home.
//
// Responde, em ordem de urgência: o que atrasou, o que é hoje, o que vem
// depois, e quais negociações são minhas. Tudo derivado de fato: nenhuma
// prioridade, score ou "lead quente".
//
// Server Component puro: sem estado, sem mutação. A Home é visão de
// trabalho e navegação — concluir/cancelar/mover continuam nas telas que
// já são donas dessas ações, para não duplicar regra de negócio aqui.

function LinhaCompromisso({
  compromisso,
  mostrarDia,
}: {
  compromisso: CompromissoCentral;
  // Em "Hoje" o dia é redundante; em atrasadas/próximas ele é essencial.
  mostrarDia: boolean;
}) {
  const quando = mostrarDia
    ? formatarDataHora(compromisso.scheduledAtISO)
    : formatarHora(compromisso.scheduledAtISO);

  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b py-2 last:border-b-0 last:pb-0">
      {/* Horário primeiro: no celular é o dado que orienta o dia. */}
      <span className="font-medium tabular-nums">{quando}</span>
      {compromisso.pessoa ? (
        <Link
          href={`/app/clientes/${compromisso.pessoa.id}`}
          className="min-w-0 break-words text-primary underline-offset-4 hover:underline"
        >
          {compromisso.pessoa.name}
        </Link>
      ) : (
        <span className="text-muted-foreground">Cliente indisponível</span>
      )}
      {compromisso.imovel && (
        <span className="min-w-0 break-words text-xs text-muted-foreground">
          · {compromisso.imovel.title}
        </span>
      )}
    </li>
  );
}

// CardTitle do design system renderiza um <div> — sem semântica de
// heading. A Central usa <h2> de verdade (a Home já tem o <h1>), para que
// leitor de tela e navegação por cabeçalho funcionem. Mesmas classes do
// CardTitle, para não destoar visualmente e sem alterar o componente
// compartilhado, o que mexeria em todos os cards do produto.
function TituloBloco({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex flex-wrap items-center gap-2 font-heading text-base leading-snug font-medium">
      {children}
    </h2>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="py-2 text-sm text-muted-foreground">{texto}</p>;
}

// "Ver todos" só aparece quando a lista foi de fato truncada — o número
// do título continua sendo o total exato, nunca o tamanho da lista.
function VerTodos({ href, total, exibidos }: { href: string; total: number; exibidos: number }) {
  if (total <= exibidos) return null;
  return (
    <Link
      href={href}
      className="mt-2 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
    >
      Ver todos ({total})
    </Link>
  );
}

export function CentralTrabalho({ dados }: { dados: DadosCentral }) {
  const { atrasadas, hoje, proximas, negociacoes } = dados;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* ATRASADAS primeiro: é o que trava a operação. Só aparece quando
          existe — um card vazio de "nenhum atraso" seria ruído diário. */}
      {atrasadas.total > 0 && (
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <TituloBloco>
              Atrasadas
              {/* Texto junto do número: o estado não depende só de cor. */}
              <Badge variant="outline" className="border-orange-300 text-orange-700">
                {atrasadas.total}{" "}
                {atrasadas.total === 1 ? "visita em aberto" : "visitas em aberto"}
              </Badge>
            </TituloBloco>
            <p className="pt-1 text-sm text-muted-foreground">
              Visitas agendadas cujo dia já passou e que continuam sem conclusão. Mais antiga
              primeiro.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="text-sm">
              {atrasadas.itens.map((c) => (
                <LinhaCompromisso key={c.id} compromisso={c} mostrarDia />
              ))}
            </ul>
            <VerTodos href="/app/agenda" total={atrasadas.total} exibidos={atrasadas.itens.length} />
          </CardContent>
        </Card>
      )}

      <Card className="min-w-0">
        <CardHeader>
          <TituloBloco>Hoje</TituloBloco>
          <p className="pt-1 text-sm text-muted-foreground">
            {hoje.total === 1 ? "1 visita agendada" : `${hoje.total} visitas agendadas`}
          </p>
        </CardHeader>
        <CardContent>
          {hoje.itens.length === 0 ? (
            <Vazio texto="Nenhum compromisso para hoje." />
          ) : (
            <>
              <ul className="text-sm">
                {hoje.itens.map((c) => (
                  <LinhaCompromisso key={c.id} compromisso={c} mostrarDia={false} />
                ))}
              </ul>
              <VerTodos href="/app/agenda" total={hoje.total} exibidos={hoje.itens.length} />
            </>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <TituloBloco>Próximos compromissos</TituloBloco>
          <p className="pt-1 text-sm text-muted-foreground">
            Visitas agendadas a partir de amanhã.
          </p>
        </CardHeader>
        <CardContent>
          {proximas.length === 0 ? (
            <Vazio texto="Nenhuma visita agendada para os próximos dias." />
          ) : (
            <>
              <ul className="text-sm">
                {proximas.map((c) => (
                  <LinhaCompromisso key={c.id} compromisso={c} mostrarDia />
                ))}
              </ul>
              <Link
                href="/app/agenda"
                className="mt-2 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                Ver agenda
              </Link>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0 lg:col-span-2">
        <CardHeader>
          <TituloBloco>Minhas negociações</TituloBloco>
          <p className="pt-1 text-sm text-muted-foreground">
            {negociacoes.total === 1
              ? "1 negociação em andamento sob sua responsabilidade"
              : `${negociacoes.total} negociações em andamento sob sua responsabilidade`}
            {negociacoes.total > 0 && " · sem alteração há mais tempo primeiro"}
          </p>
        </CardHeader>
        <CardContent>
          {negociacoes.itens.length === 0 ? (
            <Vazio texto="Você não tem negociações em andamento." />
          ) : (
            <>
              <ul className="text-sm">
                {negociacoes.itens.map((n) => (
                  <li key={n.id} className="border-b py-2 last:border-b-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      {n.pessoa ? (
                        <Link
                          href={`/app/clientes/${n.pessoa.id}`}
                          className="min-w-0 break-words font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {n.pessoa.name}
                        </Link>
                      ) : (
                        <span className="font-medium text-muted-foreground">
                          Cliente indisponível
                        </span>
                      )}
                      <Badge variant="secondary">
                        {ESTAGIO_INTERESSE_LABEL[n.stage] ?? n.stage}
                      </Badge>
                      {n.imovel && (
                        <span className="min-w-0 break-words text-xs text-muted-foreground">
                          {n.imovel.title}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {/* Fato verificável, não julgamento: a agenda
                          futura desta negociação está vazia. */}
                      {n.semProximoCompromisso
                        ? "Sem próximo compromisso"
                        : "Com visita agendada"}
                      {" · "}
                      {/* null = nenhuma interação registrada. Nunca
                          "sem contato há muito tempo". */}
                      {n.ultimoContatoISO
                        ? `último contato em ${formatarDataHora(n.ultimoContatoISO)}`
                        : "sem contato registrado"}
                    </p>
                  </li>
                ))}
              </ul>
              <VerTodos
                href="/app/pipeline"
                total={negociacoes.total}
                exibidos={negociacoes.itens.length}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
