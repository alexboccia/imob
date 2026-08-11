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
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">Contato e redes sociais</h1>
      <p className="text-muted-foreground mb-6">
        Esses dados alimentam o botão de contato flutuante, o WhatsApp dos
        imóveis e outros pontos de contato do site público.
      </p>

      <ConfiguracaoContatoForm
        config={{ ...config, themeId: branding.themeId, favicon: branding.faviconUrl }}
      />
    </div>
  );
}
