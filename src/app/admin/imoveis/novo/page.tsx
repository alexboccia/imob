import { ImovelForm } from "@/components/admin/ImovelForm";
import { criarImovel } from "@/app/admin/imoveis/actions";
import { buscarOpcoesCaracteristicas } from "@/lib/caracteristicas";
import { buscarOpcoesTiposImovel } from "@/lib/tipos-imovel";

export default async function NovoImovelPage() {
  const [{ opcoesImovel, opcoesCondominio }, { opcoesResidencial, opcoesComercial }] =
    await Promise.all([buscarOpcoesCaracteristicas(), buscarOpcoesTiposImovel()]);

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
