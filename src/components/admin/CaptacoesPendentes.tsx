import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatarDataHoraNoFuso } from "@/lib/fuso-horario";
import { ResolverCaptacao } from "@/components/admin/ResolverCaptacao";
import type { CaptacaoPendente } from "@/lib/captacao-pendente";

// Contatos pendentes de identificação (Fase 24).
//
// A fila existe porque o sistema aceitou um contato do site cujo e-mail
// aponta para um cliente e cujo telefone aponta para outro. Ele não
// escolheu — guardou. Quem escolhe é uma pessoa.
//
// A lista mostra os DADOS ENVIADOS, e não apenas "1 contato pendente":
// sem ver o nome, o e-mail e a mensagem, não há como decidir a qual
// cadastro o contato pertence, e a fila viraria um badge inútil.

export function CaptacoesPendentes({
  captacoes,
  total,
  fuso,
  // Na Home o bloco é um resumo com link para a tela; na tela própria
  // ele é a tela inteira e não precisa de "ver todos".
  href,
}: {
  captacoes: CaptacaoPendente[];
  total: number;
  fuso: string;
  href?: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <h2 className="flex flex-wrap items-center gap-2 font-heading text-base leading-snug font-medium">
          Contatos pendentes de identificação
          <Badge variant="outline" className="border-amber-300 text-amber-700">
            {total} {total === 1 ? "contato" : "contatos"}
          </Badge>
        </h2>
        <p className="pt-1 text-sm text-muted-foreground">
          Contatos recebidos pelo site cujos dados correspondem a mais de um cliente
          cadastrado. Nenhum foi perdido — cada um espera a escolha de a qual cliente
          pertence. Mais antigo primeiro.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4 text-sm">
          {captacoes.map((captacao) => (
            <li key={captacao.id} className="border-b pb-4 last:border-b-0 last:pb-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="min-w-0 break-words font-medium">{captacao.nome}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {/* O instante do ENVIO, no fuso da organização — nunca
                      a data em que alguém abriu a fila. */}
                  {formatarDataHoraNoFuso(captacao.ocorridoEmISO, fuso)}
                </span>
              </div>
              <p className="mt-0.5 min-w-0 text-xs break-words text-muted-foreground">
                {[captacao.email, captacao.telefone].filter(Boolean).join(" · ")}
              </p>
              {captacao.imovel && (
                <p className="mt-0.5 min-w-0 text-xs break-words text-muted-foreground">
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
                <p className="mt-1 min-w-0 break-words whitespace-pre-line">
                  {captacao.mensagem}
                </p>
              )}
              <div className="mt-2">
                <ResolverCaptacao captacaoId={captacao.id} candidatos={captacao.candidatos} />
              </div>
            </li>
          ))}
        </ul>
        {href && total > captacoes.length && (
          <Link
            href={href}
            className="mt-3 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            Ver todos ({total})
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
