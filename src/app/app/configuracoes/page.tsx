import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { buscarBranding } from "@/lib/branding";
import { buscarFusoOrganizacao, buscarFusoConfigurado } from "@/lib/fuso-organizacao";
import { AvisoFusoNaoConfigurado } from "@/components/admin/AvisoFusoNaoConfigurado";
import { opcoesDeFuso } from "@/lib/fusos-opcoes";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { ConfiguracaoContatoForm } from "@/components/admin/ConfiguracaoContatoForm";

export default async function ConfiguracoesPage() {
  const organizationId = await requireOrganizationId();
  const [config, branding, fuso, fusoConfigurado] = await withOrganization(organizationId, () =>
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
          fuso,
          gruposDeFuso: opcoesDeFuso(fuso),
        }}
      />
    </div>
  );
}
