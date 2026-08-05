import { prisma } from "@/lib/prisma";
import {
  criarTipoImovel,
  removerTipoImovel,
} from "@/app/admin/tipos-imovel/actions";

function ColunaTipos({
  titulo,
  categoria,
  opcoes,
}: {
  titulo: string;
  categoria: "RESIDENCIAL" | "COMERCIAL";
  opcoes: { id: string; nome: string }[];
}) {
  return (
    <div className="border rounded-lg p-5">
      <h2 className="font-medium mb-4">{titulo}</h2>

      <form action={criarTipoImovel} className="flex gap-2 mb-4">
        <input type="hidden" name="categoria" value={categoria} />
        <input
          name="nome"
          placeholder="Novo tipo de imóvel"
          required
          className="flex-1 border rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="border rounded-md px-4 py-2 text-sm font-medium"
        >
          Adicionar
        </button>
      </form>

      {opcoes.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum tipo cadastrado.</p>
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
                <form action={removerComId}>
                  <button type="submit" className="text-red-600 text-xs">
                    Remover
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default async function TiposImovelPage() {
  const opcoes = await prisma.tipoImovelOpcao.findMany();
  const porNome = (a: { nome: string }, b: { nome: string }) =>
    a.nome.localeCompare(b.nome, "pt-BR");

  const opcoesResidencial = opcoes
    .filter((o) => o.categoria === "RESIDENCIAL")
    .sort(porNome);
  const opcoesComercial = opcoes
    .filter((o) => o.categoria === "COMERCIAL")
    .sort(porNome);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Tipos de imóvel</h1>
      <p className="text-gray-500 mb-6">
        Gerencie as opções de tipo (residencial/comercial) que aparecem no
        cadastro de imóveis. Remover um tipo daqui não afeta imóveis que já
        o possuem — só deixa de aparecer como opção para novos cadastros.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <ColunaTipos
          titulo="Imóveis residenciais"
          categoria="RESIDENCIAL"
          opcoes={opcoesResidencial}
        />
        <ColunaTipos
          titulo="Imóveis comerciais"
          categoria="COMERCIAL"
          opcoes={opcoesComercial}
        />
      </div>
    </div>
  );
}
