import Link from "next/link";
import { CalendarClock, CalendarDays, Handshake } from "lucide-react";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
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
    <>
      {/* Fase 65.1 — Agenda e Negociações ganharam cabeçalho de seção.
          Antes os dois cards apareciam soltos logo depois de "O que
          precisa da sua atenção", sem nada dizendo que eram um domínio
          próprio. NÃO viraram abas: o Dashboard é uma visão operacional
          consolidada, e esconder a agenda atrás de uma aba obrigaria a
          clicar para saber se há algo hoje. */}
      <section className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={CalendarDays}
          titulo="Agenda"
          descricao="Seus compromissos e próximos atendimentos."
        />
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

        </div>
      </section>

      <section className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={Handshake}
          titulo="Minhas negociações"
          descricao="Negociações em andamento sob sua responsabilidade."
        />
      <Card className="min-w-0">
        {/* O título saiu daqui: quem nomeia a seção agora é o
            CabecalhoSecao acima (um <h2> de verdade). Repetir "Minhas
            negociações" dentro do card criaria dois cabeçalhos para o
            mesmo conteúdo. A contagem e o critério de ordenação — que são
            informação, não título — continuam visíveis. */}
        <CardHeader className="pb-3">
          <p className="min-w-0 break-words text-sm text-muted-foreground">
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
                  // Fase 65.1 — a negociação era uma linha de texto corrida
                  // dentro de um card largo. Agora tem hierarquia: cliente
                  // e estágio na primeira linha, imóvel na segunda, e os
                  // dois fatos temporais rotulados numa grade.
                  //
                  // NÃO há "Ver negociação": o produto não tem rota por
                  // negociação (/app/pipeline é um board, não há
                  // /app/pipeline/[id]). Criar o botão seria inventar um
                  // destino. A navegação real por item continua sendo o
                  // nome do cliente, que já era um link.
                  <li key={n.id} className="border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
                    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
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
                      <Badge variant="secondary" className="shrink-0">
                        {ESTAGIO_INTERESSE_LABEL[n.stage] ?? n.stage}
                      </Badge>
                    </div>

                    {n.imovel && (
                      <p className="mt-1 min-w-0 break-words text-sm text-muted-foreground">
                        {n.imovel.title}
                      </p>
                    )}

                    {/* Os dois fatos temporais ganharam rótulo: antes eram
                        uma frase corrida separada por "·", e era preciso
                        ler tudo para descobrir qual data era qual. */}
                    <dl className="mt-2 grid min-w-0 grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">Último contato</dt>
                        {/* null = nenhuma interação registrada. Nunca
                            "sem contato há muito tempo". */}
                        <dd className="min-w-0 break-words tabular-nums">
                          {n.ultimoContatoISO
                            ? formatarDataHoraNoFuso(n.ultimoContatoISO, fuso)
                            : "Sem contato registrado"}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-muted-foreground">Próximo compromisso</dt>
                        {/* Fato verificável, não julgamento: a agenda
                            futura desta negociação está vazia.
                            Fase 19 — o compromisso é NOMEADO pelo tipo:
                            pode ser visita ou follow-up, e "com visita
                            agendada" passaria a ser falso metade das
                            vezes. */}
                        <dd className="min-w-0 break-words">
                          {n.proximoCompromisso
                            ? `${TIPO_ATIVIDADE_LABEL[n.proximoCompromisso.tipo]} em ${formatarDataHoraNoFuso(
                                n.proximoCompromisso.scheduledAtISO,
                                fuso
                              )}`
                            : "Sem próximo compromisso"}
                        </dd>
                      </div>
                    </dl>
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
      </section>
    </>
  );
}
