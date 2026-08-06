import { prisma } from "@/lib/prisma";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { clienteColumns, type ClienteRow } from "./columns";
import { CriarClienteForm } from "@/components/admin/CriarClienteForm";

export default async function ClientesPage() {
  const pessoas = await prisma.pessoa.findMany({
    orderBy: { criadoEm: "desc" },
    include: { corretorAtribuido: { select: { nome: true } } },
  });

  const linhas: ClienteRow[] = pessoas.map((pessoa) => ({
    id: pessoa.id,
    nome: pessoa.nome,
    contato: pessoa.telefone ?? pessoa.email ?? "-",
    papeis: pessoa.papeis.join(", "),
    estagioFunil: pessoa.estagioFunil,
    origem: pessoa.origem ?? "-",
    corretor: pessoa.corretorAtribuido?.nome ?? "-",
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
