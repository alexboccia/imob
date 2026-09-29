import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Home, Info, Receipt, Users } from "lucide-react";
import { requireOrganizationIdParaAssinatura } from "@/lib/tenant";
import { papelAtual } from "@/lib/papel-atual";
import { temPapel, PAPEIS_FINANCEIRO } from "@/lib/authorization";
import { buscarFusoOrganizacao } from "@/lib/fuso-organizacao";
import { formatarDataNoFuso } from "@/lib/fuso-horario";
import { buscarAssinaturaOrganizacao } from "@/lib/assinatura-organizacao";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CabecalhoPagina } from "@/components/admin/ui/CabecalhoPagina";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { CartaoEstatistica } from "@/components/admin/ui/CartaoEstatistica";

// =======================================================================
// Assinatura (Fase 27; alinhamento visual na Fase 75)
// =======================================================================
// Tela de FATOS. Mostra o plano, o preço do catálogo, o estado do
// contrato, o prazo do trial e o uso contra os limites — tudo lido do
// banco, nada de provedor externo.
//
// Usa requireOrganizationIdParaAssinatura: quando o trial expira, a
// operação para, mas esta tela não. Um trial que expira e leva junto o
// caminho de regularização é um beco sem saída.
//
// A autorização usa o papel EFETIVO (papelAtual), como toda superfície
// nascida depois da correção da Fase 27 — nunca a role do token.
//
// Fase 75 — o que mudou é só APRESENTAÇÃO: nenhum dado, cálculo, query
// ou permissão foi tocado. "Mensalidade", "Imóveis ativos" e "Usuários
// ativos" viraram CartaoEstatistica (mesmo cartão de indicador do resto
// do backoffice) em vez de <p> soltos — os três são fatos do mesmo tipo
// (rótulo + número), e é exatamente o que esse componente já resolve.
// Sem barra de progresso: o domínio não tem limiar de alerta nenhum
// (nenhum "80% usado"), e inventar um seria alarmar por uma regra que
// não existe. "Mudar de plano" virou "Contratação": não existe troca de
// plano nesta tela (quem promove um plano hoje é o Super Admin, via
// alterarPlano — ver src/lib/assinatura.ts) e o título antigo prometia
// uma ação que a seção não entrega. O conteúdo da seção (como contratar,
// e que os dados continuam salvos) é preservado palavra por palavra.
export default async function AssinaturaPage() {
  const organizationId = await requireOrganizationIdParaAssinatura();
  if (!temPapel(await papelAtual(), PAPEIS_FINANCEIRO)) {
    redirect("/app");
  }

  const [assinatura, fuso] = await Promise.all([
    buscarAssinaturaOrganizacao(organizationId),
    buscarFusoOrganizacao(organizationId),
  ]);

  return (
    <div className="space-y-6">
      <CabecalhoPagina
        titulo="Assinatura"
        descricao="O contrato da sua imobiliária com o EasyMob."
      />

      <section className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={FileText}
          titulo={
            <span className="inline-flex flex-wrap items-center gap-2">
              {assinatura.nomePlano}
              {assinatura.statusRotulo && (
                <Badge
                  variant="outline"
                  className={
                    assinatura.trialExpirado ? "border-orange-300 text-orange-700" : undefined
                  }
                >
                  {assinatura.statusRotulo}
                </Badge>
              )}
            </span>
          }
          descricao={assinatura.statusDescricao ?? undefined}
        />

        {/* Sem Card envolvendo a grade: CartaoEstatistica já É um Card —
            uma moldura extra por fora seria card dentro de card, contra o
            próprio princípio do design system (ver README de
            components/admin/ui). Mesmo padrão de Dashboard/Empreendimentos/
            Comissão a receber: CabecalhoSecao seguido direto da grade. */}
        {assinatura.emTrial && (
          <p className={assinatura.trialExpirado ? "text-sm font-medium text-orange-700" : "text-sm"}>
            {assinatura.trialTerminaEmISO
              ? assinatura.trialExpirado
                ? `Seu período de avaliação terminou em ${formatarDataNoFuso(assinatura.trialTerminaEmISO, fuso)}.`
                : `Período de avaliação até ${formatarDataNoFuso(assinatura.trialTerminaEmISO, fuso)}.`
              : "Período de avaliação sem data registrada."}
          </p>
        )}

        {/* lg: (não sm:) — em ~768px o cartão muda para sm:flex-row
            (ícone ao lado do texto, CartaoEstatistica.tsx) e, dividido em
            3 colunas nessa largura, o valor mais largo corta (medido:
            "R$ 0,00" com scrollWidth 88 > clientWidth 85). Mesmo achado e
            mesma correção da Fase 69 (Comissão a receber). */}
        <div className="grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-3">
          <CartaoEstatistica
            icone={Receipt}
            tom="marca"
            rotulo="Mensalidade"
            // null é AUSÊNCIA de preço declarado, nunca R$ 0,00 —
            // dizer "gratuito" seria afirmar outra coisa.
            valor={assinatura.precoMensalFormatado ?? "não informada"}
          />
          {assinatura.limites.map((limite) => (
            <CartaoEstatistica
              key={limite.rotulo}
              icone={limite.rotulo === "Imóveis ativos" ? Home : Users}
              tom="marca"
              rotulo={limite.rotulo}
              // null no uso é "este recurso não tem uso agregado". Nunca
              // zero.
              valor={limite.usoAtual ?? "—"}
              // null no limite é ILIMITADO.
              contexto={limite.limite === null ? "sem limite" : `de ${limite.limite}`}
            />
          ))}
        </div>
      </section>

      <section className="min-w-0 space-y-4">
        <CabecalhoSecao icone={Info} titulo="Contratação" />

        <Card className="min-w-0">
          <CardContent className="min-w-0 space-y-2 text-sm text-muted-foreground">
            {/* HONESTIDADE DELIBERADA: não existe contratação dentro do
                produto ainda, e a tela não finge que existe. Um botão
                "Assinar" que não cobra nada seria pior que a ausência
                dele — ver o relatório da fase sobre a decisão comercial
                que falta para isso existir. */}
            <p>
              A contratação ainda é feita com o nosso time: escolher a forma de pagamento
              depende de uma definição comercial que ainda não está no produto.
            </p>
            <p>
              Seus dados continuam armazenados enquanto isso — nada é apagado quando o período
              de avaliação termina.
            </p>
            <Link
              href="/app"
              className="inline-block font-medium text-primary underline-offset-4 hover:underline"
            >
              Voltar ao painel
            </Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
