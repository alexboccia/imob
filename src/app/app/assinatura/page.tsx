import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrganizationIdParaAssinatura } from "@/lib/tenant";
import { papelAtual } from "@/lib/papel-atual";
import { temPapel, PAPEIS_FINANCEIRO } from "@/lib/authorization";
import { buscarFusoOrganizacao } from "@/lib/fuso-organizacao";
import { formatarDataNoFuso } from "@/lib/fuso-horario";
import { buscarAssinaturaOrganizacao } from "@/lib/assinatura-organizacao";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// =======================================================================
// Assinatura (Fase 27)
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
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="min-w-0 break-words text-2xl font-semibold">Assinatura</h1>
        <p className="text-sm text-muted-foreground">
          O contrato da sua imobiliária com o EasyMob.
        </p>
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <h2 className="flex flex-wrap items-center gap-2 font-heading text-base leading-snug font-medium">
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
          </h2>
          {assinatura.statusDescricao && (
            <p className="pt-1 text-sm text-muted-foreground">{assinatura.statusDescricao}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Mensalidade:{" "}
            <span className="font-medium">
              {/* null é AUSÊNCIA de preço declarado, nunca R$ 0,00 —
                  dizer "gratuito" seria afirmar outra coisa. */}
              {assinatura.precoMensalFormatado ?? "não informada"}
            </span>
          </p>

          {assinatura.emTrial && (
            <p className={assinatura.trialExpirado ? "font-medium text-orange-700" : undefined}>
              {assinatura.trialTerminaEmISO
                ? assinatura.trialExpirado
                  ? `Seu período de avaliação terminou em ${formatarDataNoFuso(assinatura.trialTerminaEmISO, fuso)}.`
                  : `Período de avaliação até ${formatarDataNoFuso(assinatura.trialTerminaEmISO, fuso)}.`
                : "Período de avaliação sem data registrada."}
            </p>
          )}

          <div>
            <p className="font-medium">Seu plano inclui</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {assinatura.limites.map((limite) => (
                <li key={limite.rotulo}>
                  {limite.rotulo}:{" "}
                  {/* null no limite é ILIMITADO; null no uso é "este
                      recurso não tem uso agregado". Nunca zero. */}
                  {limite.usoAtual ?? "—"}
                  {limite.limite === null ? " (sem limite)" : ` de ${limite.limite}`}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <h2 className="font-heading text-base leading-snug font-medium">
            Mudar de plano
          </h2>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
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
    </div>
  );
}
