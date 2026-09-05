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
import { formatarTaxa, type ImovelMaisProcurado } from "@/lib/analytics-comercial";

// Imóveis com mais movimento (Fase 6 — evolução da tabela da Fase 5).
//
// Antes só listava quem já tinha gerado contato. Agora inclui também o
// imóvel muito VISTO e sem nenhum contato — que é o diagnóstico mais
// acionável que o funil digital desbloqueou: 200 visualizações e zero
// contato é um anúncio com problema de preço, foto ou texto, e antes ele
// simplesmente não aparecia em lugar nenhum do produto.
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
        <CardTitle className="text-base">Imóveis com mais movimento</CardTitle>
        <p className="pt-1 text-sm text-muted-foreground">
          Ordenados por contato e, em seguida, por visualização.
        </p>
      </CardHeader>
      <CardContent>
        {imoveis.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhum imóvel teve visualização ou contato neste período.
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
                <TableHead scope="col" className="hidden xl:table-cell">
                  Localização
                </TableHead>
                <TableHead scope="col" className="w-0 text-right">
                  Views
                </TableHead>
                <TableHead scope="col" className="w-0 text-right whitespace-nowrap">
                  WhatsApp
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
                      <span className="xl:hidden"> · {imovel.localizacao}</span>
                    </span>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal sm:table-cell">
                    {imovel.tipo}
                  </TableCell>
                  <TableCell className="hidden whitespace-normal xl:table-cell">
                    {imovel.localizacao}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarNumero(imovel.visualizacoes)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarNumero(imovel.cliquesWhatsapp)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatarNumero(imovel.contatos)}
                    {/* Taxa por imóvel só quando existe denominador —
                        sem visualização no período não há taxa, e "0%"
                        seria uma afirmação falsa sobre o anúncio. */}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {formatarTaxa(imovel.taxaConversao)}
                    </span>
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
