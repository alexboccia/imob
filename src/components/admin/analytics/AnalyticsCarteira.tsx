import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatarPreco } from "@/lib/format";
import { direcaoVariacao } from "@/lib/analytics-comercial";
import { formatarPercentualInteiro } from "@/lib/format";
import type { AnalyticsCarteira as DadosCarteira } from "@/lib/analytics-carteira";
import type { ComparacaoPeriodo } from "@/lib/analytics-comercial";

// Analytics da minha carteira (Fase 23) — Server Component, só leitura.
//
// Mostra APENAS o que tem posse real. As seções organizacionais da tela
// (tráfego do site, origens, UTM, top imóveis, funil, comparação entre
// responsáveis) não aparecem aqui, e o bloco final explica por quê em
// vez de simplesmente sumir com elas.

function TituloBloco({ children }: { children: React.ReactNode }) {
  // CardTitle do design system renderiza um <div> (achado da Fase 17).
  return (
    <h2 className="flex flex-wrap items-center gap-2 font-heading text-base leading-snug font-medium">
      {children}
    </h2>
  );
}

function Indicador({
  valor,
  rotulo,
  detalhe,
}: {
  valor: string;
  rotulo: string;
  detalhe?: string;
}) {
  return (
    <div className="min-w-0">
      <span className="block text-2xl font-semibold tabular-nums">{valor}</span>
      <span className="block text-xs text-muted-foreground">{rotulo}</span>
      {detalhe && (
        <span className="mt-0.5 block min-w-0 break-words text-xs text-muted-foreground">
          {detalhe}
        </span>
      )}
    </div>
  );
}

// `textoVariacao` de analytics-comercial.ts NÃO serve aqui: ele escreve
// "contatos" no caso sem base, porque nasceu para a métrica de contatos.
// Reusá-lo diria "3 contatos" para 3 NEGOCIAÇÕES criadas — número certo,
// substantivo errado. Mesma regra de honestidade: sem base de comparação
// não existe percentual, e a diferença absoluta continua sendo verdade.
function textoVariacaoNegociacoes(comparacao: ComparacaoPeriodo): string {
  const direcao = direcaoVariacao(comparacao);
  if (direcao === "ESTAVEL") return "Sem variação vs. período anterior";
  if (direcao === "SEM_BASE") {
    const plural = Math.abs(comparacao.diferenca) === 1 ? "negociação" : "negociações";
    return `${comparacao.diferenca > 0 ? "+" : ""}${comparacao.diferenca} ${plural} — sem negociações no período anterior`;
  }
  return `${formatarPercentualInteiro(comparacao.percentual!)} vs. período anterior`;
}

export function AnalyticsCarteira({
  dados,
  periodoLabel,
}: {
  dados: DadosCarteira;
  periodoLabel: string;
}) {
  const { negociacoes, participacao } = dados;

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card className="min-w-0">
        <CardHeader>
          <TituloBloco>Minhas negociações</TituloBloco>
          {/* A frase que impede a leitura errada: o banco guarda o
              responsável ATUAL, não quem conduziu no passado. */}
          <p className="pt-1 text-sm text-muted-foreground">
            Negociações atualmente sob sua responsabilidade. {periodoLabel}.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Indicador
              valor={String(negociacoes.criadas.atual)}
              rotulo="Criadas no período"
              detalhe={textoVariacaoNegociacoes(negociacoes.criadas)}
            />
            <Indicador valor={String(negociacoes.ganhas)} rotulo="Ganhas no período" />
            <Indicador valor={String(negociacoes.perdidas)} rotulo="Perdidas no período" />
            <Indicador
              valor={String(negociacoes.emAndamento)}
              rotulo="Em andamento agora"
              detalhe="Estoque atual, não é recorte do período."
            />
          </div>

          <div className="mt-4 border-t pt-3 text-sm">
            <p>
              <span className="font-medium tabular-nums">
                {formatarPreco(negociacoes.valorFechado)}
              </span>{" "}
              <span className="text-muted-foreground">em negócios ganhos no período.</span>
            </p>
            {/* "Sem valor registrado" nunca é somado como zero (Fase 9). */}
            {negociacoes.ganhasSemValor > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {negociacoes.ganhasSemValor === 1
                  ? "1 negócio ganho está sem valor registrado e não entra nessa soma."
                  : `${negociacoes.ganhasSemValor} negócios ganhos estão sem valor registrado e não entram nessa soma.`}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <TituloBloco>Minha participação na comissão</TituloBloco>
          {/* Dimensão DIFERENTE da de cima: participar da comissão não é
              conduzir a negociação (Fase 12). */}
          <p className="pt-1 text-sm text-muted-foreground">
            Onde você é beneficiário da divisão — pode não coincidir com as negociações acima.{" "}
            {periodoLabel}.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Indicador
              valor={formatarPreco(participacao.atribuido)}
              rotulo="Atribuído a você"
              detalhe={
                participacao.negociacoes === 1
                  ? "em 1 negócio ganho"
                  : `em ${participacao.negociacoes} negócios ganhos`
              }
            />
            <Indicador
              valor={formatarPreco(participacao.recebido)}
              rotulo="Recebido no período"
              detalhe={
                participacao.pagamentos === 1
                  ? "1 pagamento registrado"
                  : `${participacao.pagamentos} pagamentos registrados`
              }
            />
          </div>
          {participacao.semValorAtribuido > 0 && (
            <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              {participacao.semValorAtribuido === 1
                ? "1 participação sua ainda não tem valor atribuído e não entra na soma."
                : `${participacao.semValorAtribuido} participações suas ainda não têm valor atribuído e não entram na soma.`}
            </p>
          )}
          {participacao.negociacoes === 0 && participacao.pagamentos === 0 && (
            <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
              Nenhuma participação sua em negócios ganhos neste período.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Não sumir em silêncio: dizer o que não está aqui, e por quê. */}
      <Card className="min-w-0">
        <CardHeader>
          <TituloBloco>O que não aparece nesta visão</TituloBloco>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p className="min-w-0 break-words">
            Visualizações de imóveis, cliques no WhatsApp, origem dos contatos, campanhas e
            imóveis mais procurados são medidas do site da imobiliária: elas não pertencem a um
            corretor, e mostrá-las filtradas por você daria um número correto com significado
            errado. Nesta organização, esses indicadores ficam com a visão da imobiliária.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
