import { prisma } from "@/lib/prisma";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";
import { hasModule } from "@/lib/entitlements";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { clienteColumns, type ClienteRow } from "./columns";
import { CriarClienteForm } from "@/components/admin/CriarClienteForm";
import { ModuloBloqueado } from "@/components/admin/ModuloBloqueado";

export default async function ClientesPage() {
  const organizationId = await requireOrganizationId();

  if (!(await hasModule(organizationId, "crm"))) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-6">Clientes</h1>
        <ModuloBloqueado
          titulo="CRM não incluído no seu plano"
          descricao="Gerencie leads, clientes e o funil de vendas em um só lugar."
        />
      </div>
    );
  }

  const pessoas = await withOrganization(organizationId, () =>
    prisma.person.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: { assignedMember: { include: { user: { select: { name: true } } } } },
    })
  );

  const linhas: ClienteRow[] = pessoas.map((pessoa) => ({
    id: pessoa.id,
    nome: pessoa.name,
    contato: pessoa.phone ?? pessoa.email ?? "-",
    papeis: pessoa.roles.join(", "),
    estagioFunil: pessoa.pipelineStage,
    origem: pessoa.source ?? "-",
    corretor: pessoa.assignedMember?.user.name ?? "-",
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Clientes</h1>

      <CriarClienteForm />

      <DataTable
        columns={clienteColumns}
        data={linhas}
        searchPlaceholder="Buscar por nome, contato, origem..."
        emptyMessage="Nenhum cliente cadastrado ainda."
      />
    </div>
  );
}
