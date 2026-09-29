import { ImovelForm } from "@/components/admin/ImovelForm";
import { criarImovel } from "@/app/app/imoveis/actions";
import { buscarOpcoesCaracteristicas } from "@/lib/caracteristicas";
import { buscarOpcoesTiposImovel } from "@/lib/tipos-imovel";
import { listarOpcoesEmpreendimento } from "@/lib/empreendimento-consultas";
import { requireOrganizationId } from "@/lib/tenant";
import { buscarOcupacaoVitrine } from "@/lib/vitrine-home-consultas";
import { withOrganization } from "@/lib/tenant-context";
import { CabecalhoPagina } from "@/components/admin/ui/CabecalhoPagina";

export default async function NovoImovelPage() {
  const organizationId = await requireOrganizationId();
  const [{ opcoesImovel, opcoesCondominio }, { opcoesResidencial, opcoesComercial }] =
    await withOrganization(organizationId, () =>
      Promise.all([
        buscarOpcoesCaracteristicas(organizationId),
        buscarOpcoesTiposImovel(organizationId),
      ])
    );
  const ocupacaoVitrine = await buscarOcupacaoVitrine(organizationId);
  // Fase 38 — uma consulta por carregamento para o seletor, nunca uma
  // por opção.
  const opcoesEmpreendimento = await listarOpcoesEmpreendimento(organizationId);

  return (
    <div className="space-y-5">
      <CabecalhoPagina
        titulo="Novo imóvel"
        descricao="Cadastre o imóvel. Ele só aparece no site quando o status for Disponível."
      />
      <ImovelForm
        action={criarImovel}
        opcoesCaracteristicasImovel={opcoesImovel}
        opcoesCaracteristicasCondominio={opcoesCondominio}
        opcoesEmpreendimento={opcoesEmpreendimento}
        opcoesTiposResidencial={opcoesResidencial}
        opcoesTiposComercial={opcoesComercial}
        ocupacaoVitrine={ocupacaoVitrine}
      />
    </div>
  );
}
