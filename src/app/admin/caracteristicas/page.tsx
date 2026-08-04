import { prisma } from "@/lib/prisma";
import {
  criarCaracteristica,
  removerCaracteristica,
} from "@/app/admin/caracteristicas/actions";

function ColunaCaracteristicas({
  titulo,
  categoria,
  opcoes,
}: {
  titulo: string;
  categoria: "IMOVEL" | "CONDOMINIO";
  opcoes: { id: string; nome: string }[];
}) {
  return (
    <div className="border rounded-lg p-5">
      <h2 className="font-medium mb-4">{titulo}</h2>

      <form action={criarCaracteristica} className="flex gap-2 mb-4">
        <input type="hidden" name="categoria" value={categoria} />
        <input
          name="nome"
          placeholder="Nova característica"
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
        <p className="text-sm text-gray-500">Nenhuma característica cadastrada.</p>
      ) : (
        <ul className="space-y-1">
          {opcoes.map((opcao) => {
            const removerComId = removerCaracteristica.bind(null, opcao.id);
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

export default async function CaracteristicasPage() {
  const opcoes = await prisma.caracteristicaOpcao.findMany();
  const porNome = (a: { nome: string }, b: { nome: string }) =>
    a.nome.localeCompare(b.nome, "pt-BR");

  const opcoesImovel = opcoes
    .filter((o) => o.categoria === "IMOVEL")
    .sort(porNome);
  const opcoesCondominio = opcoes
    .filter((o) => o.categoria === "CONDOMINIO")
    .sort(porNome);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Características</h1>
      <p className="text-gray-500 mb-6">
        Gerencie as opções que aparecem para seleção no cadastro de imóveis.
        Remover uma característica daqui não afeta imóveis que já a
        possuem — só deixa de aparecer como opção para novos cadastros.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <ColunaCaracteristicas
          titulo="Características do imóvel"
          categoria="IMOVEL"
          opcoes={opcoesImovel}
        />
        <ColunaCaracteristicas
          titulo="Características do condomínio"
          categoria="CONDOMINIO"
          opcoes={opcoesCondominio}
        />
      </div>
    </div>
  );
}
