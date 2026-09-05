import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatarNumero } from "@/lib/format";
import type { ImovelMaisProcurado } from "@/lib/analytics-comercial";

// Imóveis que mais geraram contato — a métrica mais acionável da tela: é
// o que diz onde repetir o anúncio e o que revisar.
//
// Conta APENAS contatos comerciais com propertyId real (formulário
// enviado a partir da página daquele imóvel). Contato geral da página
// /contato não tem imóvel e nunca é atribuído a nenhum — inventar essa
// atribuição transformaria conversa genérica em interesse por um imóvel
// específico.
//
// <table> semântica de verdade (scope nos cabeçalhos), não uma pilha de
// divs: é uma tabela de dados, e leitor de tela precisa navegar por
// linha/coluna. Sem PII: só dados do IMÓVEL e a contagem — nome, telefone
// e e-mail de quem procurou não têm função nenhuma numa agregação.
export function AnalyticsTopImoveis({ imoveis }: { imoveis: ImovelMaisProcurado[] }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle className="text-base">Imóveis que mais geraram contato</CardTitle>
        <p className="pt-1 text-sm text-muted-foreground">
          Contatos enviados a partir da página de cada imóvel.
        </p>
      </CardHeader>
      <CardContent>
        {imoveis.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum imóvel recebeu contato neste período.
          </p>
        ) : (
          // Sem wrapper de overflow próprio: o componente <Table> já
          // renderiza o seu (`relative w-full overflow-x-auto`) — um
          // segundo aninhado só criaria duas barras de rolagem.
          //
          // whitespace-normal nas células de texto é o que impede o bug
          // real observado a 1280px: TableCell é `whitespace-nowrap` por
          // padrão, então título e localização longos esticavam a tabela
          // além da largura do card e empurravam a coluna "Contatos" —
          // justamente o número que a tabela existe pra mostrar — pra
          // fora da área visível, atrás de um scroll horizontal que
          // ninguém adivinha que precisa usar.
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Imóvel</TableHead>
                <TableHead scope="col" className="hidden sm:table-cell">
                  Tipo
                </TableHead>
                <TableHead scope="col" className="hidden md:table-cell">
                  Localização
                </TableHead>
                {/* w-0: com `w-full` na tabela, uma largura declarada de
                    zero faz o navegador dar a esta coluna exatamente o
                    necessário pro seu conteúdo (que é `whitespace-nowrap`)
                    e distribuir o resto entre as outras — a coluna do
                    número nunca é a que cede espaço. */}
                <TableHead scope="col" className="w-0 text-right">
                  Contatos
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {imoveis.map((imovel) => (
                <TableRow key={imovel.id}>
                  <TableCell className="min-w-0 whitespace-normal">
                    <Link
                      href={`/app/imoveis/${imovel.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {imovel.titulo}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      Cód. {imovel.codigo}
                      {/* Tipo e localização somem do cabeçalho em telas
                          estreitas, mas o dado não some da tela: volta
                          aqui embaixo do título, onde há largura. */}
                      <span className="sm:hidden"> · {imovel.tipo}</span>
                      <span className="md:hidden"> · {imovel.localizacao}</span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal sm:table-cell">
                    {imovel.tipo}
                  </TableCell>
                  <TableCell className="hidden whitespace-normal md:table-cell">
                    {imovel.localizacao}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatarNumero(imovel.contatos)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
        )}
      </CardContent>
    </Card>
  );
}
