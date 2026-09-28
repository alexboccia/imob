import { prisma } from "@/lib/prisma";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { temPapel, PAPEIS_GESTAO_CATALOGOS } from "@/lib/authorization";
import { papelAtual } from "@/lib/papel-atual";
import { TiposImovelGrupoCard } from "@/components/admin/tipos-imovel/TiposImovelGrupoCard";
import { CabecalhoPagina } from "@/components/admin/ui/CabecalhoPagina";

export default async function TiposImovelPage() {
  const organizationId = await requireOrganizationId();
  // AUTHORIZATION UNCHANGED — a leitura da página continua acessível a
  // qualquer membro autenticado da organização (nenhum guard novo aqui);
  // só a UI de criar/remover passa a ficar condicionada ao mesmo papel
  // que as Server Actions já exigem (PAPEIS_GESTAO_CATALOGOS), pra não
  // oferecer uma ação que o servidor recusaria de qualquer forma — mesmo
  // padrão já usado em Características/Usuários. A garantia real continua
  // inteiramente no servidor (actions.ts).
  const podeGerenciar = temPapel(await papelAtual(), PAPEIS_GESTAO_CATALOGOS);

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
    <div className="space-y-6">
      {/* Fase 72 — cabeçalho migrado para o componente compartilhado.
          Texto PRESERVADO palavra por palavra (inclusive o break-words:
          "(residencial/comercial)" é um único token sem espaço e não
          cabia em 375/360px sem ele — achado real, preservado). Nenhum
          CTA global: a única ação de criação é por categoria, dentro de
          cada card abaixo. */}
      <CabecalhoPagina
        titulo="Tipos de imóvel"
        descricao="Gerencie as opções de tipo (residencial/comercial) que aparecem no cadastro de imóveis. Remover um tipo daqui não afeta imóveis que já o possuem — só deixa de aparecer como opção para novos cadastros."
      />

      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
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
