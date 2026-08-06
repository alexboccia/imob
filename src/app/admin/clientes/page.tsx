import { prisma } from "@/lib/prisma";
import { criarPessoa } from "@/app/admin/clientes/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/admin/data-table/DataTable";
import { clienteColumns, type ClienteRow } from "./columns";
import { FormDisclosure } from "@/components/admin/FormDisclosure";

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

      <FormDisclosure titulo="+ Cadastrar novo cliente/lead">
        <form action={criarPessoa} className="grid grid-cols-2 gap-3 text-sm">
          <Input name="nome" placeholder="Nome" required />
          <Input name="telefone" placeholder="Telefone/WhatsApp" />
          <Input name="email" type="email" placeholder="E-mail" />
          <Select name="papel" defaultValue="LEAD">
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="LEAD">Lead</SelectItem>
              <SelectItem value="CLIENTE">Cliente</SelectItem>
              <SelectItem value="PROPRIETARIO">Proprietário</SelectItem>
            </SelectContent>
          </Select>
          <Select name="origem">
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SITE">Site</SelectItem>
              <SelectItem value="INDICACAO">Indicação</SelectItem>
              <SelectItem value="PORTAL">Portal</SelectItem>
              <SelectItem value="INSTAGRAM">Instagram</SelectItem>
              <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
              <SelectItem value="OUTRO">Outro</SelectItem>
            </SelectContent>
          </Select>
          <Input name="observacoes" placeholder="Observações" className="col-span-2" />
          <Button type="submit" className="col-span-2 justify-self-start">
            Cadastrar
          </Button>
        </form>
      </FormDisclosure>

      <DataTable
        columns={clienteColumns}
        data={linhas}
        searchPlaceholder="Buscar por nome, contato, origem..."
        emptyMessage="Nenhum cliente cadastrado ainda."
      />
    </div>
  );
}
