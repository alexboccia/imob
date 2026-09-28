import Link from "next/link";
import { Banknote, HandCoins, Handshake, Info, PieChart, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { CartaoEstatistica } from "@/components/admin/ui/CartaoEstatistica";
import { EstadoVazio } from "@/components/admin/ui/EstadoVazio";
import { cn } from "@/lib/utils";
import { formatarPreco, formatarValorExato } from "@/lib/format";
import { formatarDataHoraNoFuso } from "@/lib/fuso-horario";
import {
  STATUS_A_RECEBER_LABEL,
  type CarteiraComissao,
  type NegocioDaComissao,
} from "@/lib/comissao-a-receber";
import type { StatusLiquidacao } from "@/lib/pagamento-comissao";

// Comissão a receber (Fase 35; redesenho visual na Fase 69) — leitura, e
// só. Nenhuma ação financeira mora aqui: registrar e cancelar pagamento
// continuam sendo de OWNER/ADMIN/MANAGER, na ficha do cliente, onde
// sempre estiveram (PAPEIS_LIQUIDACAO_COMISSAO). Esta tela responde uma
// pergunta; ela não move dinheiro.
//
// Fase 69 — o redesenho é só de APRESENTAÇÃO: nenhum campo, cálculo,
// query, ordenação ou permissão mudou. O que mudou:
//   - o card único "Resumo" virou uma seção (CabecalhoSecao) com os três
//     números no cartão compartilhado (CartaoEstatistica), sem uma
//     moldura extra por fora;
//   - a nota "é um saldo de hoje, não um recorte de mês" saiu da
//     descrição do card e virou um callout neutro (Info, sem cor de
//     alerta) abaixo da grade — o texto é o MESMO, só o lugar mudou;
//   - o vazio da lista de negócios virou EstadoVazio;
//   - cada negócio ganhou um <dl> com rótulo/valor de verdade
//     (acessibilidade) e a ordem dos três valores virou A receber →
//     Minha participação → Recebido, espelhando a prioridade pedida
//     para o resumo — sem trocar nome nenhum;
//   - o badge de status ganhou uma cor discreta por estado (nunca só
//     cor: o rótulo em texto de STATUS_A_RECEBER_LABEL continua sendo o
//     que a tela afirma).
//
// TRÊS NÚMEROS, SEMPRE JUNTOS: participação, recebido e saldo. Mostrar
// só o saldo esconderia de onde ele veio, e um número financeiro que não
// se consegue conferir é um número em que não se confia — por isso o
// resumo nunca aparece sem a composição por negócio logo abaixo.

// Tom por estado — SÓ apoio visual: os quatro estados já existem em
// StatusLiquidacao/STATUS_A_RECEBER_LABEL (Fase 13), nada aqui é
// inventado. Local a este arquivo, como o equivalente em
// imoveis/columns.tsx: não há um segundo consumidor que justifique
// exportar isto.
//
//   LIQUIDADO  já recebido por completo -> positivo (verde discreto);
//   PARCIAL    em andamento, precisa de atenção -> âmbar, nunca vermelho
//              (dinheiro a receber não é erro);
//   PENDENTE   nada pago ainda, mas é um fato normal do fluxo -> neutro;
//   SEM_VALOR  lacuna administrativa (ninguém declarou a parcela) -> o
//              tom mais apagado, borda tracejada, como o "Rascunho" de
//              Imóveis.
function classeStatus(status: StatusLiquidacao): string {
  switch (status) {
    case "LIQUIDADO":
      return "border-success-muted-border bg-success-muted text-success-muted-foreground";
    case "PARCIAL":
      return "border-orange-200 bg-orange-50 text-orange-800";
    case "PENDENTE":
      return "border-border bg-secondary text-secondary-foreground";
    case "SEM_VALOR":
    default:
      return "border-dashed border-border bg-transparent text-muted-foreground";
  }
}

function LinhaNegocio({ negocio, fuso }: { negocio: NegocioDaComissao; fuso: string }) {
  return (
    <li className="min-w-0 border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <Link
          href={`/app/imoveis/${negocio.imovelId}`}
          className="min-w-0 break-words font-medium text-primary underline-offset-4 hover:underline"
        >
          {negocio.imovelTitulo}
        </Link>
        {/* Estado em TEXTO dentro do badge, nunca só a cor — o rótulo é
            STATUS_A_RECEBER_LABEL, inalterado. */}
        <Badge variant="outline" className={cn("shrink-0", classeStatus(negocio.liquidacao.status))}>
          {STATUS_A_RECEBER_LABEL[negocio.liquidacao.status]}
        </Badge>
      </div>

      <p className="mt-0.5 min-w-0 break-words text-xs text-muted-foreground">
        <Link
          href={`/app/clientes/${negocio.pessoaId}`}
          className="text-primary underline-offset-4 hover:underline"
        >
          {negocio.pessoaNome}
        </Link>
        {negocio.closedAtISO && (
          <> · Fechado em {formatarDataHoraNoFuso(negocio.closedAtISO, fuso)}</>
        )}
        {/* Contexto do NEGÓCIO, deliberadamente separado da minha parte
            abaixo: comissão total não é minha participação. */}
        {negocio.closedValue !== null && <> · Valor fechado {formatarPreco(negocio.closedValue)}</>}
        {negocio.comissaoDoNegocio !== null && (
          <> · Comissão do negócio {formatarPreco(negocio.comissaoDoNegocio)}</>
        )}
      </p>

      {/* <dl> real (não três <p> soltos): cada valor financeiro tem um
          rótulo associado por semântica de definição, não só por posição
          visual. Ordem A receber -> Minha participação -> Recebido:
          mesma prioridade pedida para o resumo acima, terminologia
          intocada. */}
      <dl className="mt-2 grid grid-cols-1 gap-3 text-sm lg:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">A receber</dt>
          <dd className="min-w-0 break-words font-semibold tabular-nums">
            {/* null não vira R$ 0,00: ninguém definiu essa parcela, e
                afirmar zero seria inventar certeza. */}
            {negocio.aReceber === null ? "Não definido" : formatarValorExato(negocio.aReceber)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Minha participação</dt>
          <dd className="min-w-0 break-words font-medium tabular-nums">
            {negocio.liquidacao.atribuido === null
              ? "Não definido"
              : formatarValorExato(negocio.liquidacao.atribuido)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Recebido</dt>
          <dd className="min-w-0 break-words font-medium tabular-nums">
            {formatarValorExato(negocio.liquidacao.pago)}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export function ComissaoAReceber({
  carteira,
  fuso,
}: {
  carteira: CarteiraComissao;
  fuso: string;
}) {
  const { negocios } = carteira;

  return (
    <div className="space-y-8">
      <section className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={HandCoins}
          titulo="Resumo das comissões"
          descricao="Veja sua participação, o que já foi recebido e o saldo que ainda está em aberto."
        />

        {/* Fase 69 — três KPIs, não quatro: GradeEstatisticas é calibrada
            para 4 colunas em desktop (ver ui/CartaoEstatistica.tsx) e
            deixaria uma célula vazia à direita. Mesma decisão já tomada
            em PipelineInsights (3 indicadores próprios) — grade própria
            de 3 colunas, reaproveitando o CARTÃO compartilhado.
            `lg:` (não `sm:`) porque em ~768px o cartão já muda para
            `sm:flex-row` (ícone ao lado do texto — CartaoEstatistica.tsx)
            e, dividido em 3 colunas nessa largura, "R$ 18.000,00" corta
            (medido: scrollWidth 154 > clientWidth 85). Em 1 coluna até
            `lg`, cada cartão tem a largura cheia para o valor. */}
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
          <CartaoEstatistica
            icone={Wallet}
            tom="atencao"
            rotulo="A receber"
            valor={formatarValorExato(carteira.totalAReceber)}
          />
          <CartaoEstatistica
            icone={PieChart}
            tom="marca"
            rotulo="Minha participação"
            valor={formatarValorExato(carteira.totalAtribuido)}
            contexto={
              negocios.length === 1
                ? "em 1 negócio ganho"
                : `em ${negocios.length} negócios ganhos`
            }
          />
          <CartaoEstatistica
            icone={Banknote}
            tom="positivo"
            rotulo="Já recebido"
            valor={formatarValorExato(carteira.totalRecebido)}
          />
        </div>

        {/* Callout NEUTRO — nunca azul forte, amarelo ou aparência de
            alerta: a informação é metodológica ("isto é estoque, não
            fluxo mensal"), não um aviso. Texto preservado integralmente. */}
        <div className="flex min-w-0 items-start gap-3 rounded-xl border bg-muted/30 p-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Info aria-hidden className="size-4" />
          </span>
          <p className="min-w-0 break-words text-sm text-muted-foreground">
            Soma de todas as suas participações em negócios ganhos. É um saldo de hoje, não um
            recorte de mês: um negócio fechado em agosto pode ser pago em novembro.
          </p>
        </div>

        {/* Participação sem valor declarado NUNCA é somada como zero —
            ela é declarada aqui, para o total não parecer completo
            quando não é. */}
        {carteira.semValorAtribuido > 0 && (
          <p className="min-w-0 break-words text-xs text-muted-foreground">
            {carteira.semValorAtribuido === 1
              ? "1 participação sua ainda não tem valor definido e não entra nestas somas."
              : `${carteira.semValorAtribuido} participações suas ainda não têm valor definido e não entram nestas somas.`}
          </p>
        )}
      </section>

      <section className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={Handshake}
          titulo="Negócios"
          descricao="De onde vem o saldo acima. Negócios com valor a receber aparecem primeiro."
        />

        {negocios.length === 0 ? (
          <EstadoVazio
            icone={Handshake}
            titulo="Nenhuma comissão atribuída"
            descricao="Você ainda não é beneficiário da comissão de nenhum negócio ganho. A divisão da comissão é declarada na ficha do cliente, negócio a negócio."
          />
        ) : (
          <ul className="min-w-0">
            {negocios.map((negocio) => (
              <LinhaNegocio key={negocio.participacaoId} negocio={negocio} fuso={fuso} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
