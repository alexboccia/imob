import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarPreco, formatarValorExato } from "@/lib/format";
import { formatarDataHoraNoFuso } from "@/lib/fuso-horario";
import { STATUS_A_RECEBER_LABEL, type CarteiraComissao } from "@/lib/comissao-a-receber";

// Comissão a receber (Fase 35) — leitura, e só.
//
// Nenhuma ação financeira mora aqui: registrar e cancelar pagamento
// continuam sendo de OWNER/ADMIN/MANAGER, na ficha do cliente, onde
// sempre estiveram (PAPEIS_LIQUIDACAO_COMISSAO). Esta tela responde uma
// pergunta; ela não move dinheiro.
//
// TRÊS NÚMEROS, SEMPRE JUNTOS: participação, recebido e saldo. Mostrar
// só o saldo esconderia de onde ele veio, e um número financeiro que não
// se consegue conferir é um número em que não se confia — por isso o
// resumo nunca aparece sem a composição por negócio logo abaixo.

// Um valor com seu rótulo. O rótulo é TEXTO, lido antes do número: sem
// ele, três cifras em sequência não dizem qual é qual.
function Valor({
  rotulo,
  valor,
  destaque = false,
  detalhe,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
  detalhe?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p
        className={
          destaque
            ? "min-w-0 break-words text-2xl font-semibold tabular-nums"
            : "min-w-0 break-words text-lg font-medium tabular-nums"
        }
      >
        {valor}
      </p>
      {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
    </div>
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
    <div className="space-y-5">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Resumo</CardTitle>
          <CardDescription className="min-w-0 break-words">
            Soma de todas as suas participações em negócios ganhos. É um saldo de hoje, não um
            recorte de mês: um negócio fechado em agosto pode ser pago em novembro.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {/* "A receber" primeiro no celular — é a pergunta que traz o
              corretor até aqui, e no 320px só a primeira linha aparece
              sem rolar. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Valor
              rotulo="A receber"
              valor={formatarValorExato(carteira.totalAReceber)}
              destaque
            />
            <Valor
              rotulo="Minha participação"
              valor={formatarValorExato(carteira.totalAtribuido)}
              detalhe={
                negocios.length === 1 ? "em 1 negócio ganho" : `em ${negocios.length} negócios ganhos`
              }
            />
            <Valor rotulo="Já recebido" valor={formatarValorExato(carteira.totalRecebido)} />
          </div>

          {/* Participação sem valor declarado NUNCA é somada como zero —
              ela é declarada aqui, para o total não parecer completo
              quando não é. */}
          {carteira.semValorAtribuido > 0 && (
            <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
              {carteira.semValorAtribuido === 1
                ? "1 participação sua ainda não tem valor definido e não entra nestas somas."
                : `${carteira.semValorAtribuido} participações suas ainda não têm valor definido e não entram nestas somas.`}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Negócios</CardTitle>
          <CardDescription className="min-w-0 break-words">
            De onde vem o saldo acima. Negócios com valor a receber aparecem primeiro.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {negocios.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Você ainda não é beneficiário da comissão de nenhum negócio ganho. A divisão da
              comissão é declarada na ficha do cliente, negócio a negócio.
            </p>
          ) : (
            <ul className="space-y-4 text-sm">
              {negocios.map((negocio) => (
                <li
                  key={negocio.participacaoId}
                  className="min-w-0 border-b pb-4 last:border-b-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <Link
                      href={`/app/imoveis/${negocio.imovelId}`}
                      className="min-w-0 break-words font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {negocio.imovelTitulo}
                    </Link>
                    {/* Estado em TEXTO dentro do badge, nunca só a cor. */}
                    <Badge variant="secondary" className="shrink-0">
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
                    {/* Contexto do NEGÓCIO, deliberadamente separado da
                        minha parte logo abaixo: comissão total não é
                        minha participação. */}
                    {negocio.closedValue !== null && (
                      <> · Valor fechado {formatarPreco(negocio.closedValue)}</>
                    )}
                    {negocio.comissaoDoNegocio !== null && (
                      <> · Comissão do negócio {formatarPreco(negocio.comissaoDoNegocio)}</>
                    )}
                  </p>

                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Valor
                      rotulo="Minha participação"
                      valor={
                        // null não vira R$ 0,00: ninguém definiu essa
                        // parcela, e afirmar zero seria inventar certeza.
                        negocio.liquidacao.atribuido === null
                          ? "Não definido"
                          : formatarValorExato(negocio.liquidacao.atribuido)
                      }
                    />
                    <Valor rotulo="Recebido" valor={formatarValorExato(negocio.liquidacao.pago)} />
                    <Valor
                      rotulo="A receber"
                      valor={
                        negocio.aReceber === null
                          ? "Não definido"
                          : formatarValorExato(negocio.aReceber)
                      }
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
