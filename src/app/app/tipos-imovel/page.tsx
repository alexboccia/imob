import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { temPapel, PAPEIS_GESTAO_CATALOGOS } from "@/lib/authorization";
import { TiposImovelGrupoCard } from "@/components/admin/tipos-imovel/TiposImovelGrupoCard";

export default async function TiposImovelPage() {
  const session = await auth();
  const organizationId = await requireOrganizationId();
  // AUTHORIZATION UNCHANGED — a leitura da página continua acessível a
  // qualquer membro autenticado da organização (nenhum guard novo aqui);
  // só a UI de criar/remover passa a ficar condicionada ao mesmo papel
  // que as Server Actions já exigem (PAPEIS_GESTAO_CATALOGOS), pra não
  // oferecer uma ação que o servidor recusaria de qualquer forma — mesmo
  // padrão já usado em Características/Usuários. A garantia real continua
  // inteiramente no servidor (actions.ts).
  const podeGerenciar = temPapel(session?.user.role, PAPEIS_GESTAO_CATALOGOS);

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
    <div className="space-y-5">
      <div className="min-w-0">
        <h1 className="min-w-0 break-words text-2xl font-semibold">Tipos de imóvel</h1>
        {/* min-w-0 break-words: achado real em 375/360px — "(residencial/comercial)"
            é um único token sem espaço (o "/" não é ponto de quebra
            garantido) e não cabia na coluna estreita disponível atrás da
            sidebar fixa (scrollWidth 393 vs innerWidth 375 antes desta
            correção), mesma classe de bug já corrigida em outros títulos/
            textos do projeto. */}
        <p className="min-w-0 break-words text-sm text-muted-foreground">
          Gerencie as opções de tipo (residencial/comercial) que aparecem no
          cadastro de imóveis. Remover um tipo daqui não afeta imóveis que já
          o possuem — só deixa de aparecer como opção para novos cadastros.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TiposImovelGrupoCard
          titulo="Imóveis residenciais"
          categoria="RESIDENTIAL"
          opcoes={opcoesResidencial}
          podeGerenciar={podeGerenciar}
        />
        <TiposImovelGrupoCard
          titulo="Imóveis comerciais"
          categoria="COMMERCIAL"
          opcoes={opcoesComercial}
          podeGerenciar={podeGerenciar}
        />
      </div>
    </div>
  );
}
