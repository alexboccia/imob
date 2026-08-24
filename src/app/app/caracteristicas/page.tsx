import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { temPapel, PAPEIS_GESTAO_CATALOGOS } from "@/lib/authorization";
import { CaracteristicasKpiCards } from "@/components/admin/caracteristicas/CaracteristicasKpiCards";
import { CaracteristicasGrupoCard } from "@/components/admin/caracteristicas/CaracteristicasGrupoCard";

export default async function CaracteristicasPage() {
  const session = await auth();
  const organizationId = await requireOrganizationId();
  // AUTHORIZATION UNCHANGED — a leitura da página continua acessível a
  // qualquer membro autenticado da organização (nenhum guard novo aqui,
  // igual ao comportamento anterior); só a UI de criar/remover passa a
  // ficar condicionada ao mesmo papel que as Server Actions já exigem
  // (PAPEIS_GESTAO_CATALOGOS), pra não oferecer uma ação que o servidor
  // recusaria de qualquer forma — mesmo padrão já usado em Usuários. A
  // garantia real continua inteiramente no servidor (actions.ts,
  // inalterado nesta tarefa).
  const podeGerenciar = temPapel(session?.user.role, PAPEIS_GESTAO_CATALOGOS);

  // Mesma query única de antes (findMany sem filtro de categoria) — os 3
  // KPIs são derivados EM MEMÓRIA a partir deste mesmo resultado, zero
  // query adicional.
  const opcoes = await withOrganization(organizationId, () =>
    prisma.featureOption.findMany({ where: { organizationId } })
  );
  const porNome = (a: { nome: string }, b: { nome: string }) =>
    a.nome.localeCompare(b.nome, "pt-BR");

  const opcoesImovel = opcoes
    .filter((o) => o.category === "PROPERTY")
    .map((o) => ({ id: o.id, nome: o.name }))
    .sort(porNome);
  const opcoesCondominio = opcoes
    .filter((o) => o.category === "CONDO")
    .map((o) => ({ id: o.id, nome: o.name }))
    .sort(porNome);

  return (
    <div className="space-y-5">
      <div className="min-w-0">
        {/* break-words: achado real em 375/360px — "Características"
            (16 caracteres, uma palavra só, sem espaço pra quebrar no ponto
            normal) não cabe nos ~103px de coluna real disponível atrás da
            sidebar fixa (scrollWidth do próprio h1 media 176px sem esta
            classe) e empurrava o documento inteiro pra fora do viewport
            (scrollWidth 424 vs innerWidth 375). Mesma correção já aplicada
            no <h1>Dashboard</h1> por achado equivalente. */}
        <h1 className="min-w-0 break-words text-2xl font-semibold">Características</h1>
        <p className="text-sm text-muted-foreground">
          Gerencie as opções disponíveis para classificação dos imóveis e condomínios.
        </p>
      </div>

      <CaracteristicasKpiCards
        total={opcoes.length}
        doImovel={opcoesImovel.length}
        doCondominio={opcoesCondominio.length}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CaracteristicasGrupoCard
          titulo="Características do imóvel"
          categoria="PROPERTY"
          opcoes={opcoesImovel}
          podeGerenciar={podeGerenciar}
        />
        <CaracteristicasGrupoCard
          titulo="Características do condomínio"
          categoria="CONDO"
          opcoes={opcoesCondominio}
          podeGerenciar={podeGerenciar}
        />
      </div>
    </div>
  );
}
