import { prisma } from "@/lib/prisma";
import {
  criarCaracteristica,
  removerCaracteristica,
} from "@/app/admin/caracteristicas/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ConfirmDeleteButton } from "@/components/admin/ConfirmDeleteButton";

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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={criarCaracteristica} className="flex gap-2 mb-4">
          <input type="hidden" name="categoria" value={categoria} />
          <Input name="nome" placeholder="Nova característica" required />
          <Button type="submit" variant="outline">
            Adicionar
          </Button>
        </form>

        {opcoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma característica cadastrada.
          </p>
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
      <p className="text-muted-foreground mb-6">
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
