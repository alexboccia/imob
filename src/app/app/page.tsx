import Link from "next/link";
import { requireOrganizationId } from "@/lib/tenant";
import { auth } from "@/lib/auth";
import { hasModule } from "@/lib/entitlements";
import { buscarFusoOrganizacao, buscarFusoConfigurado } from "@/lib/fuso-organizacao";
import { escopoComercialDaSessao } from "@/lib/escopo-comercial-sessao";
import { whereAtividade } from "@/lib/escopo-comercial";
import { AvisoFusoNaoConfigurado } from "@/components/admin/AvisoFusoNaoConfigurado";
import { buscarCentralTrabalho } from "@/lib/central-trabalho";
import { CentralTrabalho } from "@/components/admin/CentralTrabalho";
import { buscarVisaoEquipe, resolverVisaoCentral } from "@/lib/central-equipe";
import { CentralEquipe } from "@/components/admin/CentralEquipe";
import { AlternadorVisaoCentral } from "@/components/admin/AlternadorVisaoCentral";
import {
  temPapel,
  PAPEIS_RESOLUCAO_IDENTIDADE,
  PAPEIS_DISTRIBUICAO_LEAD,
} from "@/lib/authorization";
import { buscarMembrosAtribuiveis } from "@/lib/membros-organizacao";
import { papelAtual } from "@/lib/papel-atual";
import {
  buscarCaptacoesPendentes,
  contarCaptacoesPendentes,
} from "@/lib/captacao-pendente";
import { CaptacoesPendentes } from "@/components/admin/CaptacoesPendentes";
import { buscarNovosContatos } from "@/lib/novos-contatos";
import { NovosContatos } from "@/components/admin/NovosContatos";
import { buscarOnboarding } from "@/lib/onboarding";
import { PrimeirosPassos } from "@/components/admin/PrimeirosPassos";
import { buscarMetricasDashboard } from "@/lib/dashboard";
import { contarAgenda } from "@/lib/agenda";
import { DashboardKpiCards } from "@/components/admin/DashboardKpiCards";
import { DashboardCharts } from "@/components/admin/DashboardCharts";
import { ChartNoAxesCombined, Clock, Inbox } from "lucide-react";
import { CabecalhoPagina } from "@/components/admin/ui/CabecalhoPagina";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { CompromissosAtrasados } from "@/components/admin/CompromissosAtrasados";

// Redesenho do Dashboard — mesmo padrão estrutural de Pipeline/Agenda/
// Usuários/Clientes: `<div className="space-y-5">` sem max-w (o <main>
// do layout já não tem largura máxima, ver src/app/app/layout.tsx),
// cabeçalho h1+subtítulo, KPIs, e o restante do conteúdo. Toda a lógica
// de cálculo (queries, janela de 6 meses, bucketização, composição) foi
// extraída pra src/lib/dashboard.ts — mesmo padrão já usado por
// src/lib/pipeline.ts/src/lib/agenda.ts, permitindo testar as funções
// puras isoladamente (dashboard.test.ts) sem precisar de banco.
type SearchParams = { visao?: string };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const organizationId = await requireOrganizationId();
  const session = await auth();
  const params = await searchParams;

  // Fase 17 — a Central é PESSOAL e depende de duas condições, ambas
  // verificadas antes de qualquer query: o vínculo do usuário com esta
  // organização (sem ele não existe "minhas negociações" que se possa
  // afirmar) e o módulo CRM, o mesmo gate que Agenda, Clientes e
  // Pipeline já aplicam — a Central lê exatamente esses dados.
  const membroId = session?.user.organizationMemberId ?? null;
  const temCrm = await hasModule(organizationId, "crm");
  // Fase 18 — o fuso comercial é resolvido UMA vez por carregamento (é
  // cacheado por organização) e repassado à Central e aos contadores:
  // "hoje" e "atrasadas" precisam ser o mesmo dia nas duas leituras.
  const fuso = await buscarFusoOrganizacao(organizationId);
  const escopo = await escopoComercialDaSessao(organizationId);
  // Fase 19 — estado BRUTO do campo (null = nunca configurado), diferente
  // do fuso EFETIVO acima, que já aplicou o fallback. É a distinção que
  // permite avisar sem mentir: "usa UTC porque ninguém escolheu" não é a
  // mesma coisa que "escolheram UTC".
  const fusoConfigurado = await buscarFusoConfigurado(organizationId);
  // Fase 21 — a decisão de autorização é uma regra NOMEADA e testada
  // (resolverVisaoCentral), não uma condição inline: `?visao=equipe` é um
  // pedido, e quem responde é o servidor.
  const { visao, podeVerEquipe } = resolverVisaoCentral({
    role: session?.user.role,
    temCrm,
    visaoPedida: params.visao,
  });
  const verEquipe = visao === "equipe";

  // A Central PESSOAL continua exatamente como estava (Fases 17-19) e
  // só deixa de ser carregada quando a visão de equipe está ativa — não
  // por perda de capacidade, e sim para não fazer sete consultas cujo
  // resultado não seria exibido.
  const central =
    membroId && temCrm && !verEquipe
      ? await buscarCentralTrabalho(organizationId, membroId, fuso)
      : null;
  const equipe = verEquipe ? await buscarVisaoEquipe(organizationId, fuso) : null;

  // Fase 24 — contatos que o site aceitou mas cuja identidade ficou
  // ambígua. Aparece na Home porque é trabalho ATRASADO por definição: o
  // cliente já escreveu e ninguém respondeu ainda. Some por completo
  // quando a fila está vazia (o caso normal) — um card permanente de
  // "nenhum contato pendente" seria ruído diário.
  //
  // Só para quem pode resolver: para um BROKER a Home continua idêntica.
  const podeIdentificar = temCrm && temPapel(await papelAtual(), PAPEIS_RESOLUCAO_IDENTIDADE);
  const captacoesPendentes = podeIdentificar
    ? await contarCaptacoesPendentes(organizationId)
    : 0;
  // A contagem vem primeiro e a lista só é buscada se houver algo: no
  // caso normal (fila vazia) isso custa um COUNT e nada mais.
  const captacoes =
    captacoesPendentes > 0
      ? await buscarCaptacoesPendentes(organizationId, { limite: 3 })
      : [];

  // Caixa de entrada comercial — contatos que chegaram pelo site e ainda
  // não foram trabalhados. É a primeira coisa da tela porque é o único
  // trabalho que hoje depende de alguém LEMBRAR de procurar: a Central
  // mostra compromissos já marcados, e um contato novo ainda não é
  // compromisso nenhum.
  //
  // Escopado pelo MESMO `escopo` do resto da Central, com uma ampliação
  // declarada na Fase 36: em modo restrito o corretor vê os contatos das
  // pessoas com quem tem vínculo comercial E os que ainda não são de
  // ninguém — trabalho em aberto da organização, que é o que a fila
  // existe para distribuir. Ver wherePessoaNaFilaDeEntrada.
  const novosContatos =
    temCrm && membroId
      ? await buscarNovosContatos(organizationId, escopo)
      : { itens: [], total: 0, truncado: false };

  // Fase 36 — quem pode APONTAR o trabalho de outra pessoa. Assumir para
  // si não exige papel nenhum além do CRM (a action decide); atribuir e
  // transferir são autoridade comercial. A tela só esconde o botão — a
  // action revalida o papel de novo no servidor.
  const podeAtribuirContato =
    temCrm && temPapel(await papelAtual(), PAPEIS_DISTRIBUICAO_LEAD);
  // A lista de destinos só é carregada por quem pode atribuir, e uma vez
  // por carregamento — nunca uma consulta por card.
  const membrosParaAtribuir =
    podeAtribuirContato && novosContatos.itens.length > 0
      ? await buscarMembrosAtribuiveis(organizationId)
      : [];

  // Fase 26 — primeiros passos. Derivado de fatos, some quando não há
  // pendência: para uma organização já operando, isto é uma consulta
  // barata que não renderiza nada.
  const onboarding = await buscarOnboarding(organizationId);

  const [metricas, agenda] = await Promise.all([
    buscarMetricasDashboard(organizationId, fuso),
    // Reaproveita contarAgenda (já existente, já testado via H.4/H.5) só
    // pra ler `.atrasadas` — nenhuma query nova, nenhuma lógica de
    // "atraso" duplicada aqui. Ver relatório final, seção "Atenção
    // necessária", sobre por que só este item (visitas atrasadas) entrou
    // nesta versão: é o único, dos exemplos conceituais do pedido, que
    // tem uma contagem já pronta e barata — "negociações que precisam de
    // atenção" (Pipeline) exigiria carregar o board aberto inteiro só
    // pra extrair um número, e "imóveis parados" já é um KPI acima.
    // Fase 22 — o contador de atrasadas da Home também é escopado: em
    // modo restrito ele mostra o atraso do próprio corretor, nunca o da
    // organização inteira.
    contarAgenda(organizationId, fuso, whereAtividade(escopo)),
  ]);

  // A seção de atenção só se justifica quando há algo nela: contatos novos
  // na fila, captações a identificar ou compromissos atrasados. Sem nada
  // disso, o cabeçalho "o que precisa da sua atenção" apareceria sobre o
  // vazio todos os dias.
  const temAtencao =
    novosContatos.itens.length > 0 ||
    captacoes.length > 0 ||
    (central?.atrasadas.total ?? 0) > 0;

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        // Saudação sem "bom dia/boa tarde": mesmo com fuso da organização
        // (Fase 18), o produto sabe o dia comercial — não a hora local de
        // QUEM olha. Afirmar período do dia continuaria sendo chute.
        titulo={session?.user.name ? `Olá, ${session.user.name}` : "Início"}
        descricao="O que precisa da sua atenção agora."
      />

      {/* Fase 19 — adoção do fuso: aparece só enquanto ninguém escolheu,
          nunca bloqueia a Central. */}
      <AvisoFusoNaoConfigurado fusoConfigurado={fusoConfigurado} />

      {/* O alternador só existe para quem tem autoridade gerencial. Para
          um BROKER a Home continua sendo, literalmente, a mesma tela de
          antes — nenhum controle novo, nenhum aviso de acesso negado. */}
      {podeVerEquipe && <AlternadorVisaoCentral visaoAtual={visao} />}

      {/* Acima da Central: para quem acabou de criar a conta, a Central
          está vazia por definição, e a primeira coisa útil da tela tem
          de ser o que fazer a seguir. */}
      <PrimeirosPassos dados={onboarding} />

      {/* ===== O QUE PRECISA DA SUA ATENÇÃO =====
          AÇÃO primeiro, contexto depois: o trabalho operacional abre a
          tela, e a visão agregada da operação (KPIs e gráficos, que já
          existiam e continuam valendo) segue abaixo.

          A seção só existe quando há algo dentro dela — um cabeçalho
          "precisa da sua atenção" sobre o vazio seria ruído diário. */}
      {temAtencao && (
        <section className="min-w-0 space-y-4">
          <CabecalhoSecao
            icone={Inbox}
            titulo="O que precisa da sua atenção"
            descricao="Priorizamos os contatos e compromissos que precisam de ação."
          />

          {/* Novos contatos ocupa a área maior; atrasadas fica como coluna
              secundária à direita. A proporção 3/2 acompanha a quantidade
              real de informação: um contato traz foto, imóvel, mensagem e
              ações; um atraso traz uma linha por compromisso. Empilha
              abaixo de xl — em lg a coluna secundária já ficaria estreita
              demais para as linhas de compromisso. */}
          <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] xl:items-start">
            <div className="min-w-0 space-y-4">
              <NovosContatos
                dados={novosContatos}
                meuMemberId={membroId}
                podeAtribuir={podeAtribuirContato}
                membros={membrosParaAtribuir}
              />

              {captacoes.length > 0 && (
                <CaptacoesPendentes
                  captacoes={captacoes}
                  total={captacoesPendentes}
                  fuso={fuso}
                  href="/app/captacoes"
                />
              )}
            </div>

            {central && <CompromissosAtrasados atrasadas={central.atrasadas} fuso={fuso} />}
          </div>
        </section>
      )}

      {/* ===== AGENDA E NEGOCIAÇÕES ===== */}
      {central && <CentralTrabalho dados={central} fuso={fuso} />}
      {equipe && <CentralEquipe dados={equipe} fuso={fuso} />}

      {/* ===== VISÃO GERAL ===== */}
      <section className="min-w-0 space-y-4 pt-1">
        <CabecalhoSecao
          icone={ChartNoAxesCombined}
          titulo="Visão geral"
          descricao="Panorama da operação imobiliária."
        />

        <DashboardKpiCards metricas={metricas} />

        {agenda.atrasadas > 0 && (
          // Callout discreto, não faixa de alerta: ele REPETE de propósito
          // uma informação que o card "Atrasadas" acima já dá, porque aqui
          // o escopo é outro — o contador da Agenda (contarAgenda) conta a
          // organização/carteira segundo a política de visibilidade, e não
          // só os compromissos pessoais da Central. Remover seria perder
          // esse recorte, não eliminar duplicidade.
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50/50 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-700">
                <Clock aria-hidden className="size-4" />
              </span>
              <p className="min-w-0 break-words text-sm">
                <span className="font-medium">
                  {agenda.atrasadas === 1
                    ? "1 visita atrasada"
                    : `${agenda.atrasadas} visitas atrasadas`}
                </span>{" "}
                <span className="text-muted-foreground">precisam de atenção.</span>
              </p>
            </div>
            <Link
              href="/app/agenda?aba=anteriores&status=ATRASADAS"
              className="shrink-0 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Ver agenda →
            </Link>
          </div>
        )}

      <DashboardCharts
        tendencia={metricas.tendencia}
        composicaoTipo={metricas.composicaoTipo}
        composicaoBairro={metricas.composicaoBairro}
        composicaoStatus={metricas.composicaoStatus}
      />
      </section>
    </div>
  );
}
