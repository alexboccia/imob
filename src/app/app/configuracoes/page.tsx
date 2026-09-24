import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { buscarBranding } from "@/lib/branding";
import { buscarFusoOrganizacao, buscarFusoConfigurado } from "@/lib/fuso-organizacao";
import { AvisoFusoNaoConfigurado } from "@/components/admin/AvisoFusoNaoConfigurado";
import { opcoesDeFuso } from "@/lib/fusos-opcoes";
import { buscarVisibilidadeComercial } from "@/lib/visibilidade-comercial";
import { requireOrganizationId } from "@/lib/tenant";
import { temPapel, PAPEIS_GESTAO_CONFIGURACOES } from "@/lib/authorization";
import { papelAtual } from "@/lib/papel-atual";
import { withOrganization } from "@/lib/tenant-context";
import { ConfiguracaoContatoForm } from "@/components/admin/ConfiguracaoContatoForm";
import { buscarImoveisPrevia } from "@/lib/previa-identidade-data";
import { IMAGEM_HERO_PADRAO } from "@/lib/site-config";
import { prisma } from "@/lib/prisma";

export default async function ConfiguracoesPage() {
  const organizationId = await requireOrganizationId();

  // Fase 23 — gate de PÁGINA, fechando a dívida que a Fase 22 registrou:
  // a Server Action já exigia PAPEIS_GESTAO_CONFIGURACOES, mas a tela
  // abria para qualquer membro. Um corretor via a configuração inteira
  // da organização — inclusive a política de visibilidade comercial e o
  // fuso — e só descobria que não podia mudar nada ao tentar salvar.
  //
  // Mesmo conjunto de papéis da action, mesmo padrão de recusa das
  // outras telas administrativas (ver /app/usuarios/[id]): mensagem
  // curta, nenhum dado carregado. Nada abaixo desta checagem executa,
  // então nenhuma consulta de configuração chega a rodar.
  if (!temPapel(await papelAtual(), PAPEIS_GESTAO_CONFIGURACOES)) {
    return (
      <div className="max-w-lg">
        <h1 className="min-w-0 break-words text-2xl font-semibold">Configurações</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Apenas administradores podem alterar as configurações da imobiliária.
        </p>
      </div>
    );
  }

  const [
    config,
    branding,
    fuso,
    fusoConfigurado,
    visibilidadeComercial,
    imoveisPrevia,
    organizacao,
  ] = await withOrganization(organizationId, () =>
    Promise.all([
      buscarConfiguracaoContato(organizationId),
      buscarBranding(organizationId),
      // Fase 18 — já resolvido: organização sem fuso configurado devolve
      // o fallback explícito (UTC), nunca null, para o formulário nunca
      // apresentar "nenhuma opção selecionada".
      buscarFusoOrganizacao(organizationId),
      // Fase 19 — valor bruto, para o aviso de adoção saber diferenciar
      // "nunca configurado" de "configurado como UTC".
      buscarFusoConfigurado(organizationId),
      buscarVisibilidadeComercial(organizationId),
      // Fase 62 — os imóveis que a prévia da identidade mostra. Mesma
      // consulta em paralelo com as outras: não adiciona um round-trip
      // sequencial à tela.
      buscarImoveisPrevia(organizationId),
      // Nome "oficial" da organização: é o que o site público usa quando
      // não há nome público configurado (ver [orgSlug]/layout.tsx), então
      // é também o fallback correto do rótulo na prévia.
      prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { name: true },
      }),
    ])
  );

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="min-w-0 break-words text-2xl font-semibold">Configurações</h1>
        <p className="text-sm text-muted-foreground">
          Personalize a identidade, os contatos e as informações públicas da imobiliária.
        </p>
      </div>

      <AvisoFusoNaoConfigurado fusoConfigurado={fusoConfigurado} />

      <ConfiguracaoContatoForm
        config={{
          ...config,
          themeId: branding.themeId,
          favicon: branding.faviconUrl,
          nomePublico: branding.displayName,
          footerAppearance: branding.footerAppearance,
          temaCustomizado: branding.customTheme,
          nomeOrganizacao: organizacao.name,
          // Mesmo fallback da Home pública: a imagem configurada, ou o
          // asset de marca quando a organização nunca customizou.
          heroPrevia: config.heroImage ?? IMAGEM_HERO_PADRAO,
          imoveisPrevia,
          fuso,
          gruposDeFuso: opcoesDeFuso(fuso),
          visibilidadeComercial,
        }}
      />
    </div>
  );
}
