import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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

function TituloBloco({ children }: { children: React.ReactNode }) {
  // Mesmo motivo da Fase 17: CardTitle do design system renderiza um
  // <div>, sem semântica de heading.
  return (
    <h2 className="flex flex-wrap items-center gap-2 font-heading text-base leading-snug font-medium">
      {children}
    </h2>
  );
}

// Número + rótulo, com link quando existe uma tela que investiga aquilo.
// Sem link, continua sendo um fato legível — nunca um botão morto.
function Indicador({
  valor,
  rotulo,
  href,
}: {
  valor: number;
  rotulo: string;
  href?: string;
}) {
  const conteudo = (
    <>
      <span className="block text-2xl font-semibold tabular-nums">{valor}</span>
      <span className="block text-xs text-muted-foreground">{rotulo}</span>
    </>
  );
  return (
    <div className="min-w-0">
      {href ? (
        <Link
          href={href}
          className="block rounded-md underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {conteudo}
        </Link>
      ) : (
        conteudo
      )}
    </div>
  );
}

export function CentralEquipe({ dados, fuso }: { dados: VisaoEquipe; fuso: string }) {
  const { resumo, membros, atrasadasDaEquipe } = dados;

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card className="min-w-0">
        <CardHeader>
          <TituloBloco>Resumo da equipe</TituloBloco>
          <p className="pt-1 text-sm text-muted-foreground">
            Compromissos e negociações de toda a organização.
          </p>
        </CardHeader>
        <CardContent>
          {/* 2 colunas no celular, 4 a partir de sm: nunca uma tabela
              larga, que no telefone viraria scroll horizontal. */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Indicador valor={resumo.atrasadas} rotulo="Atrasados" href="/app/agenda?aba=anteriores&status=ATRASADAS" />
            <Indicador valor={resumo.hoje} rotulo="Hoje" href="/app/agenda" />
            <Indicador valor={resumo.proximas} rotulo="Próximos" href="/app/agenda?aba=proximas" />
            <Indicador valor={resumo.negociacoesAbertas} rotulo="Negociações abertas" href="/app/pipeline" />
          </div>

          {/* Fato, não julgamento: nada de "abandonadas" ou "esquecidas".
              Leva ao Pipeline JÁ FILTRADO pelo filtro que a tela dona já
              tinha — nenhum filtro novo foi inventado para a Central. */}
          <div className="mt-4 border-t pt-3 text-sm">
            {resumo.semResponsavel === 0 ? (
              <p className="text-muted-foreground">Nenhuma negociação sem responsável.</p>
            ) : (
              <p>
                <Link
                  href={`/app/pipeline?responsavel=${FILTRO_SEM_RESPONSAVEL}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  {resumo.semResponsavel === 1
                    ? "1 negociação sem responsável"
                    : `${resumo.semResponsavel} negociações sem responsável`}
                </Link>{" "}
                <span className="text-muted-foreground">— atribuir no Pipeline.</span>
              </p>
            )}
            {/* Só aparece quando existe: é uma anomalia que nenhum fluxo
                do produto cria, e declará-la é melhor que somá-la a
                alguém que não é dono. */}
            {resumo.semNegociacao > 0 && (
              <p className="mt-1 text-muted-foreground">
                {resumo.semNegociacao === 1
                  ? "1 compromisso não está vinculado a uma negociação e não aparece por responsável."
                  : `${resumo.semNegociacao} compromissos não estão vinculados a uma negociação e não aparecem por responsável.`}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <TituloBloco>Distribuição por responsável</TituloBloco>
          <p className="pt-1 text-sm text-muted-foreground">
            Trabalho em aberto de cada pessoa, em ordem alfabética. Não é ranking nem avaliação.
          </p>
        </CardHeader>
        <CardContent>
          {membros.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Nenhuma negociação aberta nem compromisso pendente na equipe.
            </p>
          ) : (
            <ul className="text-sm">
              {membros.map((membro) => (
                <li
                  key={membro.memberId ?? "sem-responsavel"}
                  className="border-b py-2.5 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    {membro.memberId ? (
                      <Link
                        href={`/app/pipeline?responsavel=${membro.memberId}`}
                        className="min-w-0 break-words font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {membro.nome}
                      </Link>
                    ) : (
                      <Link
                        href={`/app/pipeline?responsavel=${FILTRO_SEM_RESPONSAVEL}`}
                        className="min-w-0 break-words font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {membro.nome}
                      </Link>
                    )}
                    {/* Texto, nunca só cor: o nome permanece e ganha a
                        marca — jamais vira "Sem responsável". */}
                    {membro.inativo && (
                      <Badge variant="outline" className="shrink-0">
                        inativo
                      </Badge>
                    )}
                  </div>
                  {/* Linhas de números que quebram no celular em vez de
                      formar colunas de tabela. */}
                  <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {membro.negociacoesAbertas}{" "}
                      {membro.negociacoesAbertas === 1 ? "negociação aberta" : "negociações abertas"}
                    </span>
                    <span className="tabular-nums">{membro.atrasadas} atrasados</span>
                    <span className="tabular-nums">{membro.hoje} hoje</span>
                    <span className="tabular-nums">{membro.proximas} próximos</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Igual à Central pessoal: o bloco de atrasados só existe quando há
          atraso — um card diário de "nenhum atraso" seria ruído. */}
      {atrasadasDaEquipe.total > 0 && (
        <Card className="min-w-0">
          <CardHeader>
            <TituloBloco>
              Atrasados da equipe
              <Badge variant="outline" className="border-orange-300 text-orange-700">
                {atrasadasDaEquipe.total}{" "}
                {atrasadasDaEquipe.total === 1 ? "em aberto" : "em aberto"}
              </Badge>
            </TituloBloco>
            <p className="pt-1 text-sm text-muted-foreground">
              Compromissos cujo dia já passou e que continuam sem conclusão. Mais antigo primeiro.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="text-sm">
              {atrasadasDaEquipe.itens.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b py-2 last:border-b-0 last:pb-0"
                >
                  <span className="font-medium tabular-nums">
                    {formatarDataHoraNoFuso(item.scheduledAtISO, fuso)}
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {TIPO_ATIVIDADE_LABEL[item.tipo]}
                  </Badge>
                  {item.assunto && (
                    <span className="min-w-0 break-words font-medium">{item.assunto}</span>
                  )}
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
                  <span className="min-w-0 break-words text-xs text-muted-foreground">
                    ·{" "}
                    {item.responsavel
                      ? `${item.responsavel.nome}${item.responsavel.inativo ? " (inativo)" : ""}`
                      : "Sem responsável"}
                  </span>
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
    </div>
  );
}
