import { prisma } from "@/lib/prisma";
import {
  criarTipoImovel,
  removerTipoImovel,
} from "@/app/app/tipos-imovel/actions";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";
import { NovoItemCatalogoForm } from "@/components/admin/NovoItemCatalogoForm";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";

function ColunaTipos({
  titulo,
  categoria,
  opcoes,
}: {
  titulo: string;
  categoria: "RESIDENTIAL" | "COMMERCIAL";
  opcoes: { id: string; nome: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <NovoItemCatalogoForm
          action={criarTipoImovel}
          categoria={categoria}
          placeholder="Novo tipo de imóvel"
        />

        {opcoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum tipo cadastrado.</p>
        ) : (
          <ul className="space-y-1">
            {opcoes.map((opcao) => {
              const removerComId = removerTipoImovel.bind(null, opcao.id);
              return (
                <li
                  key={opcao.id}
                  className="flex items-center justify-between text-sm py-1 border-b last:border-b-0"
                >
                  <span>{opcao.nome}</span>
                  <ConfirmDeleteButton
                    action={removerComId}
                    itemLabel={opcao.nome}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default async function TiposImovelPage() {
  const organizationId = await requireOrganizationId();
  const opcoes = await withOrganization(organizationId, () =>
    prisma.propertyTypeOption.findMany({ where: { organizationId } })
  );
  const porNome = (a: { nome: string }, b: { nome: string }) =>
    a.nome.localeCompare(b.nome, "pt-BR");

  const opcoesResidencial = opcoes
    .filter((o) => o.category === "RESIDENTIAL")
    .map((o) => ({ id: o.id, nome: o.name }))
    .sort(porNome);
  const opcoesComercial = opcoes
    .filter((o) => o.category === "COMMERCIAL")
    .map((o) => ({ id: o.id, nome: o.name }))
    .sort(porNome);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Tipos de imóvel</h1>
      <p className="text-muted-foreground mb-6">
        Gerencie as opções de tipo (residencial/comercial) que aparecem no
        cadastro de imóveis. Remover um tipo daqui não afeta imóveis que já
        o possuem — só deixa de aparecer como opção para novos cadastros.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <ColunaTipos
          titulo="Imóveis residenciais"
          categoria="RESIDENTIAL"
          opcoes={opcoesResidencial}
        />
        <ColunaTipos
          titulo="Imóveis comerciais"
          categoria="COMMERCIAL"
          opcoes={opcoesComercial}
        />
      </div>
    </div>
  );
}
