import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { buscarBranding } from "@/lib/branding";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { ConfiguracaoContatoForm } from "@/components/admin/ConfiguracaoContatoForm";

export default async function ConfiguracoesPage() {
  const organizationId = await requireOrganizationId();
  const [config, branding] = await withOrganization(organizationId, () =>
    Promise.all([
      buscarConfiguracaoContato(organizationId),
      buscarBranding(organizationId),
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

      <ConfiguracaoContatoForm
        config={{
          ...config,
          themeId: branding.themeId,
          favicon: branding.faviconUrl,
          nomePublico: branding.displayName,
        }}
      />
    </div>
  );
}
