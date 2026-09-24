import Link from "next/link";
import { CalendarClock, CalendarDays, Handshake } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EstadoVazio } from "@/components/admin/ui/EstadoVazio";
import { Badge } from "@/components/ui/badge";
import { formatarDataHoraNoFuso, formatarHoraNoFuso } from "@/lib/fuso-horario";
import { ESTAGIO_INTERESSE_LABEL } from "@/lib/property-interest-schema";
import { TIPO_ATIVIDADE_LABEL } from "@/lib/follow-up";
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

export function LinhaCompromisso({
  compromisso,
  mostrarDia,
  fuso,
}: {
  compromisso: CompromissoCentral;
  // Em "Hoje" o dia é redundante; em atrasadas/próximas ele é essencial.
  mostrarDia: boolean;
  fuso: string;
}) {
  const quando = mostrarDia
    ? formatarDataHoraNoFuso(compromisso.scheduledAtISO, fuso)
    : formatarHoraNoFuso(compromisso.scheduledAtISO, fuso);

  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b py-2 last:border-b-0 last:pb-0">
      {/* Horário primeiro: no celular é o dado que orienta o dia. */}
      <span className="font-medium tabular-nums">{quando}</span>
      {/* Fase 19 — o TIPO em texto, nunca só cor/ícone: a Central passou
          a misturar visita e follow-up, e o corretor precisa saber o que
          é cada linha antes de qualquer outra coisa. */}
      <Badge variant="outline" className="shrink-0">
        {TIPO_ATIVIDADE_LABEL[compromisso.tipo]}
      </Badge>
      {compromisso.assunto && (
        <span className="min-w-0 break-words font-medium">{compromisso.assunto}</span>
      )}
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
// heading. A Central usa heading de verdade, para que leitor de tela e
// navegação por cabeçalho funcionem.
//
// Fase 65 — passou a <h3>: os cards da Central vivem DENTRO da seção "O
// que precisa da sua atenção" (um <h2>), então <h2> aqui quebraria a
// hierarquia de cabeçalhos da página. O visual é o mesmo.
export function TituloBloco({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex flex-wrap items-center gap-2 font-heading text-base leading-snug font-medium">
      {children}
    </h3>
  );
}

// "Ver todos" só aparece quando a lista foi de fato truncada — o número
// do título continua sendo o total exato, nunca o tamanho da lista.
export function VerTodos({ href, total, exibidos }: { href: string; total: number; exibidos: number }) {
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

// O fuso atravessa como string simples (Fase 16 preservada: DTOs planos,
// nenhum objeto do Prisma na fronteira). Formatar com timeZone explícito
// nos dois lados é também o que evita mismatch de hidratação — sem ele o
// servidor renderiza num fuso e o navegador re-renderiza no dele.
export function CentralTrabalho({ dados, fuso }: { dados: DadosCentral; fuso: string }) {
  const { hoje, proximas, negociacoes } = dados;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader>
          <TituloBloco>Hoje</TituloBloco>
          <p className="pt-1 text-sm text-muted-foreground">
            {hoje.total === 1 ? "1 compromisso agendado" : `${hoje.total} compromissos agendados`}
          </p>
        </CardHeader>
        <CardContent>
          {hoje.itens.length === 0 ? (
            <EstadoVazio
              icone={CalendarDays}
              titulo="Nenhum compromisso para hoje."
              descricao="Visitas, reuniões e ligações agendadas para hoje aparecem aqui."
            />
          ) : (
            <>
              <ul className="text-sm">
                {hoje.itens.map((c) => (
                  <LinhaCompromisso key={c.id} compromisso={c} mostrarDia={false} fuso={fuso} />
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
            Compromissos agendados a partir de amanhã.
          </p>
        </CardHeader>
        <CardContent>
          {proximas.length === 0 ? (
            <EstadoVazio
              icone={CalendarClock}
              titulo="Nenhum compromisso agendado para os próximos dias."
              descricao="O que for agendado a partir de amanhã aparece aqui."
            />
          ) : (
            <>
              <ul className="text-sm">
                {proximas.map((c) => (
                  <LinhaCompromisso key={c.id} compromisso={c} mostrarDia fuso={fuso} />
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
            <EstadoVazio
              icone={Handshake}
              titulo="Você não tem negociações em andamento."
              descricao="As negociações sob sua responsabilidade aparecem aqui."
            />
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
                      {/* Fase 19 — o próximo compromisso é nomeado: pode
                          ser visita ou follow-up, e "com visita agendada"
                          passaria a ser falso metade das vezes. */}
                      {n.proximoCompromisso
                        ? `${TIPO_ATIVIDADE_LABEL[n.proximoCompromisso.tipo]} em ${formatarDataHoraNoFuso(
                            n.proximoCompromisso.scheduledAtISO,
                            fuso
                          )}`
                        : "Sem próximo compromisso"}
                      {" · "}
                      {/* null = nenhuma interação registrada. Nunca
                          "sem contato há muito tempo". */}
                      {n.ultimoContatoISO
                        ? `último contato em ${formatarDataHoraNoFuso(n.ultimoContatoISO, fuso)}`
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
