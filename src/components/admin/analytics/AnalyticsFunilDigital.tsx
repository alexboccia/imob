import { Eye, MessageCircle, Inbox } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { formatarNumero } from "@/lib/format";
import { formatarTaxa, type FunilDigital } from "@/lib/analytics-comercial";

// Funil digital (Fase 6) — VISUALIZAÇÃO → INTENÇÃO → CONTATO.
//
// Componente burro: recebe tudo calculado por buscarAnalyticsComercial.
//
// A apresentação é deliberadamente uma ESCADA VISUAL com três degraus,
// e NÃO um funil de percentuais encadeados: clique no WhatsApp e envio
// de formulário são caminhos PARALELOS (quem chama no WhatsApp
// normalmente não preenche o formulário), então encadear "x% passou da
// etapa 1 pra 2 e y% da 2 pra 3" seria aritmética falsa. Cada degrau
// mostra seu próprio número e sua própria definição em texto; as duas
// taxas exibidas comparam cada etapa com a MESMA base (visualizações),
// que é a única relação defensável.
//
// Acessibilidade: as barras são `aria-hidden` — o dado inteiro (rótulo,
// definição, número absoluto e taxa) está escrito em texto ao lado, e a
// largura da barra nunca é a única forma de ler a informação.

const ICONE_ETAPA = {
  VISUALIZACOES: Eye,
  WHATSAPP: MessageCircle,
  CONTATOS: Inbox,
} as const;

export function AnalyticsFunilDigital({
  funil,
  periodoLabel,
}: {
  funil: FunilDigital;
  periodoLabel: string;
}) {
  const base = funil.etapas[0]?.total ?? 0;

  return (
    // role="region" + aria-labelledby: o funil é uma seção com identidade
    // própria dentro da página, e um leitor de tela deve conseguir pular
    // direto pra ela pelo nome — mesmo tratamento já dado à nota de
    // método em /app/analytics.
    <Card className="min-w-0" role="region" aria-labelledby="analytics-funil-titulo">
      <CardHeader>
        <CardTitle className="text-base" id="analytics-funil-titulo">
          Funil digital
        </CardTitle>
        <p className="pt-1 text-sm text-muted-foreground">
          {periodoLabel} · do anúncio visto até o contato registrado
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {funil.semHistoricoDigital ? (
          // Estado do dia seguinte ao deploy: nunca houve evento nenhum.
          // Mostrar três zeros aqui pareceria desempenho ruim, quando na
          // verdade a medição acabou de começar. Nada de backfill,
          // nada de número inventado — só a explicação honesta.
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            A medição de visualizações e cliques começou agora. Os números aparecem aqui conforme
            as pessoas visitarem as páginas dos seus imóveis — não há histórico anterior a esta
            medição, e nada foi estimado para trás.
          </p>
        ) : (
          <>
            <ol className="space-y-3">
              {funil.etapas.map((etapa) => {
                const Icone = ICONE_ETAPA[etapa.chave];
                // Largura relativa à PRIMEIRA etapa — é uma proporção
                // visual, não uma taxa de conversão declarada.
                const largura = base > 0 ? Math.max((etapa.total / base) * 100, etapa.total > 0 ? 4 : 0) : 0;
                return (
                  <li key={etapa.chave} className="min-w-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="flex min-w-0 items-center gap-2 text-sm">
                        <Icone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0 break-words font-medium">{etapa.rotulo}</span>
                      </span>
                      <span className="shrink-0 text-lg font-semibold tabular-nums">
                        {formatarNumero(etapa.total)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${largura}%` }} />
                    </div>
                    <p className="mt-1 min-w-0 break-words text-xs text-muted-foreground">
                      {etapa.definicao}
                    </p>
                  </li>
                );
              })}
            </ol>

            <dl className="grid grid-cols-1 gap-3 border-t pt-3 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Contato a cada visualização</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatarTaxa(funil.taxaContatoPorVisualizacao)}
                </dd>
                <p className="text-xs text-muted-foreground">
                  Contatos pelo formulário do imóvel ÷ visualizações
                </p>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">WhatsApp a cada visualização</dt>
                <dd className="text-lg font-semibold tabular-nums">
                  {formatarTaxa(funil.taxaWhatsappPorVisualizacao)}
                </dd>
                <p className="text-xs text-muted-foreground">
                  Cliques no WhatsApp ÷ visualizações
                </p>
              </div>
            </dl>

            <p className="text-xs text-muted-foreground">
              WhatsApp e formulário são caminhos paralelos, não etapas em sequência: quem clica no
              WhatsApp normalmente não preenche o formulário. Um clique registra a intenção de
              conversar — não confirma que a mensagem foi enviada.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
