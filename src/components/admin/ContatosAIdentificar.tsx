import Link from "next/link";
import { UserSearch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { EstadoVazio } from "@/components/admin/ui/EstadoVazio";
import { ResolverCaptacao } from "@/components/admin/ResolverCaptacao";
import { formatarDataHoraNoFuso } from "@/lib/fuso-horario";
import type { CaptacaoPendente } from "@/lib/captacao-pendente";

// Página própria da fila de identificação (Fase 24; redesenho visual na
// Fase 70) — não o resumo que aparece na Home. `CaptacoesPendentes.tsx`
// continua intocado: ele é o widget compacto (Card com h2 e badge)
// reaproveitado na Home E aqui teria duplicado o cabeçalho da seção
// (CabecalhoSecao já dá título e descrição — o h2 antigo por dentro do
// Card ficaria repetindo a mesma informação duas vezes). Por isso este é
// um componente NOVO, local a esta página, que reaproveita apenas o que
// é genuinamente comum: `ResolverCaptacao` (a única ação real) e a
// mesma leitura de dados de `captacao-pendente.ts` — nenhuma regra,
// query ou permissão muda aqui.
//
// A ÚNICA ação que existe é vincular o contato a um cliente já
// cadastrado, entre os candidatos que o e-mail ou o telefone realmente
// batem (ver ResolverCaptacao.tsx). Não existe "criar cliente" nem
// "ignorar/descartar" — decisão de produto documentada lá, preservada
// aqui sem adicionar nenhuma delas.
export function ContatosAIdentificar({
  captacoes,
  total,
  fuso,
}: {
  captacoes: CaptacaoPendente[];
  total: number;
  fuso: string;
}) {
  return (
    <section className="min-w-0 space-y-4">
      <CabecalhoSecao
        icone={UserSearch}
        titulo={
          total > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              Contatos pendentes
              {/* Mesmo tom âmbar do resumo na Home: "aguardando decisão",
                  não erro. Contagem real (`total`), não inventada. */}
              <Badge variant="outline" className="border-amber-300 text-amber-700">
                {total} {total === 1 ? "contato" : "contatos"}
              </Badge>
            </span>
          ) : (
            "Contatos pendentes"
          )
        }
        // "Vincular", não "associar": é o verbo real da ação (ver o
        // botão "Vincular contato" e o legend "Vincular ao cliente" em
        // ResolverCaptacao.tsx) — a UI não inventa um sinônimo.
        descricao="Revise os contatos que ainda precisam ser vinculados a um cliente."
      />

      <Card className="min-w-0">
        <CardContent>
          {total === 0 ? (
            <EstadoVazio
              icone={UserSearch}
              titulo="Nenhum contato para identificar"
              // Frase factual, não genérica: a fila NÃO existe para
              // "todo contato novo" (esses viram Person automaticamente,
              // ver person-dedup.ts) — só para quando e-mail e telefone
              // enviados apontam para clientes DIFERENTES já cadastrados.
              descricao="Quando um contato enviado pelo site tiver e-mail e telefone apontando para clientes diferentes, ele aparece aqui para alguém decidir a quem pertence."
            />
          ) : (
            <ul className="min-w-0 space-y-4 text-sm">
              {captacoes.map((captacao) => (
                <li
                  key={captacao.id}
                  className="min-w-0 border-b pb-4 last:border-b-0 last:pb-0"
                >
                  {/* Identidade primeiro (Fase 70 §9): é o único dado que
                      permite reconhecer QUEM escreveu, antes de qualquer
                      outra coisa. `nome` nunca é nulo (schema), mas
                      e-mail, telefone, imóvel e mensagem podem faltar —
                      cada um só aparece quando existe. */}
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                    <span className="min-w-0 break-words font-semibold">{captacao.nome}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {formatarDataHoraNoFuso(captacao.ocorridoEmISO, fuso)}
                    </span>
                  </div>

                  {(captacao.email || captacao.telefone) && (
                    <p className="mt-0.5 min-w-0 break-words text-xs text-muted-foreground">
                      {[captacao.email, captacao.telefone].filter(Boolean).join(" · ")}
                    </p>
                  )}

                  {captacao.imovel && (
                    <p className="mt-0.5 min-w-0 break-words text-xs text-muted-foreground">
                      Imóvel:{" "}
                      <Link
                        href={`/app/imoveis/${captacao.imovel.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {captacao.imovel.title}
                      </Link>
                    </p>
                  )}

                  {captacao.mensagem && (
                    <p className="mt-1.5 min-w-0 break-words whitespace-pre-line">
                      {captacao.mensagem}
                    </p>
                  )}

                  <div className="mt-2.5">
                    <ResolverCaptacao captacaoId={captacao.id} candidatos={captacao.candidatos} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
