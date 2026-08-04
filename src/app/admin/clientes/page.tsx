import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { criarPessoa } from "@/app/admin/clientes/actions";

const ESTAGIO_LABEL: Record<string, string> = {
  NOVO_LEAD: "Novo lead",
  CONTATO_FEITO: "Contato feito",
  VISITA_AGENDADA: "Visita agendada",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

export default async function ClientesPage() {
  const pessoas = await prisma.pessoa.findMany({
    orderBy: { criadoEm: "desc" },
    include: { corretorAtribuido: { select: { nome: true } } },
  });

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Clientes</h1>

      <details className="mb-6 border rounded-lg p-4">
        <summary className="cursor-pointer font-medium text-sm">
          + Cadastrar novo cliente/lead
        </summary>
        <form action={criarPessoa} className="grid grid-cols-2 gap-3 mt-4 text-sm">
          <input
            name="nome"
            placeholder="Nome"
            required
            className="border rounded-md px-3 py-2"
          />
          <input
            name="telefone"
            placeholder="Telefone/WhatsApp"
            className="border rounded-md px-3 py-2"
          />
          <input
            name="email"
            type="email"
            placeholder="E-mail"
            className="border rounded-md px-3 py-2"
          />
          <select name="papel" className="border rounded-md px-3 py-2">
            <option value="LEAD">Lead</option>
            <option value="CLIENTE">Cliente</option>
            <option value="PROPRIETARIO">Proprietário</option>
          </select>
          <select name="origem" className="border rounded-md px-3 py-2">
            <option value="">Origem</option>
            <option value="SITE">Site</option>
            <option value="INDICACAO">Indicação</option>
            <option value="PORTAL">Portal</option>
            <option value="INSTAGRAM">Instagram</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="OUTRO">Outro</option>
          </select>
          <input
            name="observacoes"
            placeholder="Observações"
            className="border rounded-md px-3 py-2 col-span-2"
          />
          <button
            type="submit"
            className="bg-black text-white rounded-md px-4 py-2 col-span-2 justify-self-start hover:bg-gray-800 active:bg-gray-900 transition-colors"
          >
            Cadastrar
          </button>
        </form>
      </details>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Contato</th>
              <th className="px-4 py-2">Papéis</th>
              <th className="px-4 py-2">Estágio</th>
              <th className="px-4 py-2">Origem</th>
              <th className="px-4 py-2">Corretor</th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((pessoa) => (
              <tr key={pessoa.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link
                    href={`/admin/clientes/${pessoa.id}`}
                    className="font-medium hover:underline"
                  >
                    {pessoa.nome}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  {pessoa.telefone ?? pessoa.email ?? "-"}
                </td>
                <td className="px-4 py-2">{pessoa.papeis.join(", ")}</td>
                <td className="px-4 py-2">
                  {ESTAGIO_LABEL[pessoa.estagioFunil]}
                </td>
                <td className="px-4 py-2">{pessoa.origem ?? "-"}</td>
                <td className="px-4 py-2">
                  {pessoa.corretorAtribuido?.nome ?? "-"}
                </td>
              </tr>
            ))}
            {pessoas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  Nenhum cliente cadastrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
