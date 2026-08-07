import { ImovelForm } from "@/components/admin/ImovelForm";
import { criarImovel } from "@/app/admin/imoveis/actions";
import { buscarOpcoesCaracteristicas } from "@/lib/caracteristicas";
import { buscarOpcoesTiposImovel } from "@/lib/tipos-imovel";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";

export default async function NovoImovelPage() {
  const organizationId = await requireOrganizationId();
  const [{ opcoesImovel, opcoesCondominio }, { opcoesResidencial, opcoesComercial }] =
    await withOrganization(organizationId, () =>
      Promise.all([
        buscarOpcoesCaracteristicas(organizationId),
        buscarOpcoesTiposImovel(organizationId),
      ])
    );

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Novo imóvel</h1>
      <ImovelForm
        action={criarImovel}
        opcoesCaracteristicasImovel={opcoesImovel}
        opcoesCaracteristicasCondominio={opcoesCondominio}
        opcoesTiposResidencial={opcoesResidencial}
        opcoesTiposComercial={opcoesComercial}
      />
    </div>
  );
}
