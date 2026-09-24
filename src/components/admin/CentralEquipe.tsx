import Link from "next/link";
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  Handshake,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { EstadoVazio } from "@/components/admin/ui/EstadoVazio";
import {
  CartaoEstatistica,
  GradeEstatisticas,
} from "@/components/admin/ui/CartaoEstatistica";
import { iniciaisDoNome } from "@/lib/iniciais";
import { formatarDataHoraNoFuso } from "@/lib/fuso-horario";
import { TIPO_ATIVIDADE_LABEL } from "@/lib/follow-up";
import { FILTRO_SEM_RESPONSAVEL } from "@/lib/pipeline";
import type { VisaoEquipe } from "@/lib/central-equipe";

// Visão de equipe da Central (Fase 21) — Server Component, sem estado e
// SEM NENHUMA MUTAÇÃO. A Central aponta o que está acontecendo; quem
// resolve é a tela dona: atribuir/transferir no Pipeline, concluir na
// Agenda. Duplicar essas ações aqui duplicaria regra de negócio.
//
// Não é ranking, não é desempenho e não tem gráfico: quem quer análise
// vai para o Analytics. Aqui só há contagem operacional e um caminho
// para investigar.
//
// Fase 65.1 — migrada para a linguagem do novo backoffice. O que saiu:
// o `TituloBloco` local (substituído por CabecalhoSecao, que já dá heading
// de verdade), o `Indicador` local (substituído por CartaoEstatistica, com
// os MESMOS links de investigação) e os estados vazios próprios
// (substituídos por EstadoVazio). Nenhuma contagem, consulta, ordenação ou
// link mudou — só a apresentação.

export function CentralEquipe({ dados, fuso }: { dados: VisaoEquipe; fuso: string }) {
  const { resumo, membros, atrasadasDaEquipe } = dados;

  return (
    <>
      {/* ===== VISÃO DA EQUIPE ===== */}
      <section className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={UsersRound}
          titulo="Visão da equipe"
          // Descrição PRESERVADA: ela é mais precisa que um texto genérico
          // sobre carga de trabalho — deixa explícito que os números são da
          // ORGANIZAÇÃO, não "meus", que é a diferença inteira entre esta
          // visão e a pessoal.
          descricao="Compromissos e negociações de toda a organização."
        />

        {/* Os quatro números passaram a usar o cartão compartilhado, com os
            MESMOS destinos de investigação que já tinham. Tons semânticos,
            nunca avaliação: atraso é atenção, o resto é neutro/informativo. */}
        <GradeEstatisticas>
          <CartaoEstatistica
            icone={AlertTriangle}
            tom="atencao"
            rotulo="Atrasados"
            valor={resumo.atrasadas}
            href="/app/agenda?aba=anteriores&status=ATRASADAS"
          />
          <CartaoEstatistica
            icone={CalendarCheck}
            tom="info"
            rotulo="Hoje"
            valor={resumo.hoje}
            href="/app/agenda"
          />
          <CartaoEstatistica
            icone={CalendarClock}
            tom="info"
            rotulo="Próximos"
            valor={resumo.proximas}
            href="/app/agenda?aba=proximas"
          />
          <CartaoEstatistica
            icone={Handshake}
            tom="marca"
            rotulo="Negociações abertas"
            valor={resumo.negociacoesAbertas}
            href="/app/pipeline"
          />
        </GradeEstatisticas>

        {/* Fato, não julgamento: nada de "abandonadas" ou "esquecidas".
            Leva ao Pipeline JÁ FILTRADO pelo filtro que a tela dona já
            tinha — nenhum filtro novo foi inventado para a Central.
            Callout discreto, no mesmo tratamento do aviso de visitas
            atrasadas do Dashboard. Só existe quando há o que apontar: um
            "nenhuma negociação sem responsável" diário seria ruído. */}
        {resumo.semResponsavel > 0 && (
          <div
            data-sem-responsavel
            className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50/50 p-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
                <UserRound aria-hidden className="size-4" />
              </span>
              <p className="min-w-0 break-words text-sm font-medium">
                {resumo.semResponsavel === 1
                  ? "1 negociação sem responsável"
                  : `${resumo.semResponsavel} negociações sem responsável`}
              </p>
            </div>
            <Link
              href={`/app/pipeline?responsavel=${FILTRO_SEM_RESPONSAVEL}`}
              className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Atribuir no Pipeline →
            </Link>
          </div>
        )}

        {/* Só aparece quando existe: é uma anomalia que nenhum fluxo do
            produto cria, e declará-la é melhor que somá-la a alguém que não
            é dono. */}
        {resumo.semNegociacao > 0 && (
          <p className="min-w-0 break-words text-sm text-muted-foreground">
            {resumo.semNegociacao === 1
              ? "1 compromisso não está vinculado a uma negociação e não aparece por responsável."
              : `${resumo.semNegociacao} compromissos não estão vinculados a uma negociação e não aparecem por responsável.`}
          </p>
        )}
      </section>

      {/* ===== DISTRIBUIÇÃO POR RESPONSÁVEL ===== */}
      <section className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={Users}
          titulo="Distribuição por responsável"
          descricao="Trabalho em aberto de cada pessoa, em ordem alfabética. Não é ranking nem avaliação."
        />

        <Card className="min-w-0">
          <CardContent>
            {membros.length === 0 ? (
              <EstadoVazio
                icone={Users}
                titulo="Nenhuma negociação aberta nem compromisso pendente na equipe."
                descricao="Quando houver trabalho em aberto, ele aparece distribuído por responsável aqui."
              />
            ) : (
              // LINHAS, não um card por pessoa: a organização pode ter 20+
              // responsáveis, e um card cheio por pessoa tornaria a página
              // interminável. Cada linha é compacta e a lista cresce
              // linearmente.
              <ul data-distribuicao-equipe className="min-w-0">
                {membros.map((membro) => (
                  <li
                    key={membro.memberId ?? "sem-responsavel"}
                    className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <Avatar className="size-8 shrink-0">
                      {membro.memberId ? (
                        // Iniciais do nome real — a pessoa não tem foto no
                        // modelo, e inventar uma seria mentir.
                        <AvatarFallback className="bg-primary-light text-xs font-medium text-primary">
                          {iniciaisDoNome(membro.nome)}
                        </AvatarFallback>
                      ) : (
                        // "Sem responsável" não é uma pessoa: representação
                        // neutra, nunca iniciais de um nome que não existe.
                        <AvatarFallback className="bg-muted text-muted-foreground">
                          <UserRound aria-hidden className="size-4" />
                        </AvatarFallback>
                      )}
                    </Avatar>

                    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <Link
                        href={`/app/pipeline?responsavel=${membro.memberId ?? FILTRO_SEM_RESPONSAVEL}`}
                        className="min-w-0 break-words font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {membro.nome}
                      </Link>
                      {/* Texto, nunca só cor: o nome permanece e ganha a
                          marca — jamais vira "Sem responsável". */}
                      {membro.inativo && (
                        <Badge variant="outline" className="shrink-0">
                          inativo
                        </Badge>
                      )}
                    </div>

                    {/* Números rotulados, alinhados à direita em telas com
                        espaço e quebrando abaixo do nome no celular. Sem
                        barras comparativas, sem cor por pessoa: é
                        distribuição de carga, não avaliação. */}
                    <dl className="flex min-w-0 shrink-0 flex-wrap gap-x-4 gap-y-1 text-xs">
                      {[
                        {
                          valor: membro.negociacoesAbertas,
                          rotulo:
                            membro.negociacoesAbertas === 1
                              ? "negociação aberta"
                              : "negociações abertas",
                        },
                        { valor: membro.atrasadas, rotulo: "atrasados" },
                        { valor: membro.hoje, rotulo: "hoje" },
                        { valor: membro.proximas, rotulo: "próximos" },
                      ].map((metrica) => (
                        <div key={metrica.rotulo} className="min-w-0">
                          <dd className="font-semibold tabular-nums">{metrica.valor}</dd>
                          <dt className="min-w-0 break-words text-muted-foreground">
                            {metrica.rotulo}
                          </dt>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ===== ATRASADOS DA EQUIPE =====
          Igual à Central pessoal: só existe quando há atraso — um card
          diário de "nenhum atraso" seria ruído. Mesmo tratamento de
          ATENÇÃO (borda e fundo âmbar suaves + ícone) do card "Atrasadas"
          da visão pessoal; componentes separados porque o DTO é outro
          (estes itens carregam responsável), e um "componente universal"
          cheio de condicionais seria pior que os dois. */}
      {atrasadasDaEquipe.total > 0 && (
        <Card
          data-atrasados-equipe
          className="min-w-0 border-orange-200 bg-orange-50/40"
        >
          <CardHeader>
            <h3 className="flex min-w-0 flex-wrap items-center gap-2 font-heading text-base leading-snug font-medium">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-700">
                <AlertTriangle aria-hidden className="size-3.5" />
              </span>
              Atrasados da equipe
              {/* Texto junto do número: o estado não depende só de cor. */}
              <Badge variant="outline" className="border-orange-300 text-orange-700">
                {atrasadasDaEquipe.total} em aberto
              </Badge>
            </h3>
            <p className="pt-1 text-sm text-muted-foreground">
              Compromissos cujo dia já passou e que continuam sem conclusão. Mais antigo primeiro.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="text-sm">
              {atrasadasDaEquipe.itens.map((item) => (
                <li
                  key={item.id}
                  className="border-b py-2.5 first:pt-0 last:border-b-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-medium tabular-nums">
                      {formatarDataHoraNoFuso(item.scheduledAtISO, fuso)}
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {TIPO_ATIVIDADE_LABEL[item.tipo]}
                    </Badge>
                    {item.assunto && (
                      <span className="min-w-0 break-words font-medium">{item.assunto}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
                    {item.pessoa ? (
                      <Link
                        href={`/app/clientes/${item.pessoa.id}`}
                        className="min-w-0 break-words text-primary underline-offset-4 hover:underline"
                      >
                        {item.pessoa.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">Cliente indisponível</span>
                    )}
                    <span className="min-w-0 break-words text-muted-foreground">
                      ·{" "}
                      {item.responsavel
                        ? `${item.responsavel.nome}${item.responsavel.inativo ? " (inativo)" : ""}`
                        : "Sem responsável"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            {atrasadasDaEquipe.total > atrasadasDaEquipe.itens.length && (
              <Link
                href="/app/agenda?aba=anteriores&status=ATRASADAS"
                className="mt-2 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                Ver todos ({atrasadasDaEquipe.total})
              </Link>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
