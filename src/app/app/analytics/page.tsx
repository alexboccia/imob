import { requireOrganizationId } from "@/lib/tenant";
import { hasModule } from "@/lib/entitlements";
import { formatarNumero } from "@/lib/format";
import {
  buscarAnalyticsComercial,
  interpretarPeriodoAnalytics,
  PERIODO_ANALYTICS_LABEL,
} from "@/lib/analytics-comercial";
import { ModuloBloqueado } from "@/components/admin/ModuloBloqueado";
import { AnalyticsPeriodoChips } from "@/components/admin/analytics/AnalyticsPeriodoChips";
import { AnalyticsKpiCards } from "@/components/admin/analytics/AnalyticsKpiCards";
import { AnalyticsSerieContatos } from "@/components/admin/analytics/AnalyticsSerieContatos";
import { AnalyticsOrigens } from "@/components/admin/analytics/AnalyticsOrigens";
import { AnalyticsTopImoveis } from "@/components/admin/analytics/AnalyticsTopImoveis";
import { AnalyticsFunilDigital } from "@/components/admin/analytics/AnalyticsFunilDigital";
import { AnalyticsAquisicao } from "@/components/admin/analytics/AnalyticsAquisicao";
import { AnalyticsResultado } from "@/components/admin/analytics/AnalyticsResultado";
import { AnalyticsResponsaveis } from "@/components/admin/analytics/AnalyticsResponsaveis";
import { AnalyticsParticipacao } from "@/components/admin/analytics/AnalyticsParticipacao";
import { AnalyticsLiquidacao } from "@/components/admin/analytics/AnalyticsLiquidacao";

// Analytics comercial (Fase 5).
//
// POR QUE UMA PÁGINA PRÓPRIA, e não mais uma seção do Dashboard:
// o /app (Dashboard) responde "como está meu ESTOQUE e minha operação
// agora" — imóveis disponíveis, imóveis parados, negócios fechados no mês,
// composição do portfólio — e é deliberadamente uma foto do presente, sem
// filtro de período. Esta tela responde outra pergunta, "como o mercado
// está me procurando ao longo do tempo", e TODO o seu conteúdo depende de
// uma janela temporal escolhida pelo usuário. Enfiar um seletor de período
// no Dashboard que governasse metade dos cards e não a outra metade seria
// pior pros dois. Não há duplicação: nenhum número desta página existe no
// Dashboard (lá "Novos leads" conta Person por createdAt, aqui contam-se
// EVENTOS de contato por occurredAt — coisas diferentes, de propósito).
//
// AUTORIZAÇÃO: mesmo portão das outras telas de CRM (Clientes, Pipeline,
// Agenda) — sessão válida via requireOrganizationId (que já cobre org
// suspensa e trial expirado) + módulo "crm". Nenhum RBAC novo foi
// inventado: esta página é uma AGREGAÇÃO de dados que qualquer membro com
// CRM já pode ler linha a linha na ficha de cada cliente. Restringi-la a
// papéis específicos criaria uma regra que não existe em nenhuma outra
// tela equivalente.
//
// Sem cache: a leitura é sob demanda, por requisição, dentro do escopo de
// organizationId (withOrganization + WHERE explícito). Nenhum
// unstable_cache próprio foi introduzido de propósito — uma chave de
// cache mal formada aqui misturaria números entre tenants, e o custo real
// da tela (4 queries em uma tabela pequena) não justifica esse risco.
// A única leitura cacheada envolvida é buscarConfiguracaoContato, que já
// tem a organização na chave desde que foi criada.

export const metadata = { title: "Analytics comercial" };

type SearchParams = { periodo?: string };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const organizationId = await requireOrganizationId();

  if (!(await hasModule(organizationId, "crm"))) {
    return (
      <div className="max-w-3xl">
        <ModuloBloqueado
          titulo="CRM não incluído no seu plano"
          descricao="Acompanhe de onde vêm seus contatos e quais imóveis mais atraem interesse."
        />
      </div>
    );
  }

  const periodo = interpretarPeriodoAnalytics(params);
  const analytics = await buscarAnalyticsComercial(organizationId, { periodo });
  const periodoLabel = PERIODO_ANALYTICS_LABEL[periodo];

  return (
    <div className="space-y-5">
      {/* min-w-0 + break-words no h1: mesma proteção do Dashboard — atrás
          da sidebar fixa, a coluna real em 360px é menor que a largura
          natural de uma palavra longa em text-2xl. */}
      <div className="min-w-0">
        <h1 className="min-w-0 break-words text-2xl font-semibold">Analytics comercial</h1>
        <p className="text-sm text-muted-foreground">
          Como o mercado procurou a sua imobiliária pelos formulários do site.
        </p>
      </div>

      <AnalyticsPeriodoChips periodo={periodo} />

      <AnalyticsKpiCards analytics={analytics} periodoLabel={periodoLabel} />

      <AnalyticsSerieContatos
        serie={analytics.serie}
        granularidade={analytics.granularidade}
        periodoLabel={periodoLabel}
      />

      {/* Funil digital (Fase 6) ao lado da origem dos contatos: as duas
          respondem "de onde veio o interesse", uma pelo comportamento no
          site, outra pela página que originou o contato. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AnalyticsFunilDigital funil={analytics.funil} periodoLabel={periodoLabel} />
        <AnalyticsOrigens origens={analytics.origens} total={analytics.contatos.atual} />
      </div>

      <AnalyticsResultado resultado={analytics.resultado} periodoLabel={periodoLabel} />

      {/* Fase 11 — depois do resultado agregado e antes da aquisição:
          "quanto a operação fez" -> "quem conduziu" -> "de onde veio". */}
      <AnalyticsResponsaveis
        responsaveis={analytics.responsaveis}
        periodoLabel={periodoLabel}
        semOwnership={analytics.semOwnership}
      />

      {/* Fase 12 — logo depois de "quem conduziu", vem "quem participa
          do dinheiro". As duas dimensões coexistem, nunca se substituem. */}
      <AnalyticsParticipacao participacao={analytics.participacao} periodoLabel={periodoLabel} />

      {/* Fase 13 — fecha a cadeia: conduziu -> atribuído -> PAGO. Cada
          bloco responde uma pergunta diferente e nenhum substitui outro. */}
      <AnalyticsLiquidacao liquidacao={analytics.liquidacao} periodoLabel={periodoLabel} />

      <AnalyticsAquisicao
        aquisicao={analytics.aquisicao}
        periodoLabel={periodoLabel}
        semVinculoDeOrigem={analytics.resultado.semVinculoDeOrigem}
      />

      <AnalyticsTopImoveis imoveis={analytics.topImoveis} />

      {/* Nota de método — a tela declara em texto o que ela conta e o que
          ela NÃO conta. É isso que impede o corretor de ler estes números
          como "todo o movimento do CRM" e de estranhar um total menor que
          o histórico da ficha de um cliente. */}
      <section
        aria-labelledby="analytics-metodo"
        className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm"
      >
        <h2 id="analytics-metodo" className="font-medium text-foreground">
          Como estes números são calculados
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Conta apenas contatos recebidos pelos formulários do site: página de um imóvel, página
            de contato e “anuncie seu imóvel”.
          </li>
          <li>
            Interações registradas manualmente pela equipe e visitas concluídas não entram — são o
            trabalho da equipe, não procura do mercado.
          </li>
          <li>
            Um mesmo contato conta como 1 contato; uma mesma pessoa que voltou várias vezes conta
            como 1 pessoa.
          </li>
          <li>
            Uma visualização é a página de um imóvel aberta no navegador de uma pessoa, contada no
            máximo uma vez a cada 30 minutos por visitante e por imóvel. Rastreadores que não
            executam JavaScript, prefetch e verificações automáticas não entram.
          </li>
          <li>
            Visualizações e cliques passaram a ser medidos a partir da publicação desta versão —
            não existe histórico anterior, e nada foi estimado para trás.
          </li>
          <li>
            Oportunidade é um imóvel relacionado a um cliente; negociação ganha é uma oportunidade
            encerrada como ganha pela equipe. Só aparecem com canal de origem as que foram criadas
            a partir de um contato do site — nenhuma origem foi deduzida para as demais. O valor
            fechado e a comissão são informados pela equipe ao marcar a negociação como ganha (a
            comissão é opcional e pode ser preenchida depois). Ganhos anteriores a cada uma dessas
            medições aparecem sem o valor correspondente, e nada foi estimado a partir do preço do
            imóvel nem de qualquer percentual — o sistema não tem percentual de comissão
            configurado. Como não se registra a divisão da comissão, nada aqui é receita da
            imobiliária.
          </li>
          <li>
            O responsável é quem <strong>conduz a negociação</strong> — não é o responsável pelo
            imóvel, nem o responsável pelo cliente, nem quem registrou o contato: são papéis
            diferentes e o sistema guarda cada um separadamente. Negociações anteriores a esta
            medição aparecem em “Sem responsável”, porque nenhuma foi atribuída retroativamente. A
            comissão agrupada por responsável é a dos negócios sob responsabilidade dessa pessoa,
            e não uma afirmação de quanto ela recebeu.
          </li>
          <li>
            A divisão da comissão é <strong>declarada pela equipe</strong>, participante por
            participante. Nada é dividido automaticamente: ser responsável pela negociação não dá
            a ninguém parcela nenhuma, e o que não foi atribuído aparece como “não distribuída” em
            vez de ganhar um destino inventado. “Comissão atribuída” não é valor recebido — o
            sistema não registra pagamento, imposto nem repasse.
          </li>
          <li>
            Comissão <strong>paga</strong> é diferente de comissão atribuída: só conta quando
            alguém registra o pagamento, com a data em que ele ocorreu. O bloco de liquidação usa
            essa data, não a do fechamento — um negócio fechado antes do período e pago dentro
            dele aparece aqui. Pagamentos cancelados saem da conta mas continuam no histórico da
            negociação. Nada é considerado pago por ter sido ganho, atribuído ou fechado.
          </li>
          <li>
            O canal de aquisição descreve <strong>a visita</strong> (de onde a pessoa chegou desta
            vez), não o cadastro do cliente. A origem cadastral continua sendo o campo “Origem” da
            ficha, preenchido pela equipe, e não é alterada por esta medição.
          </li>
          <li>
            O período anterior usado na comparação tem exatamente o mesmo número de dias, colado
            imediatamente antes deste. O último dia do período atual é hoje, ainda em curso.
          </li>
          {analytics.interacoesSemOrigem > 0 && (
            <li>
              {formatarNumero(analytics.interacoesSemOrigem)}{" "}
              {analytics.interacoesSemOrigem === 1
                ? "interação deste período não tem origem registrada"
                : "interações deste período não têm origem registrada"}{" "}
              (registro manual da equipe, ou anteriores ao início desta medição) e por isso ficam
              de fora dos números acima — nenhuma origem foi atribuída a elas por suposição.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
