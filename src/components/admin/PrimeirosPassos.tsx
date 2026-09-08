import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Onboarding } from "@/lib/onboarding";

// Primeiros passos (Fase 26) — a ponte entre "criei a conta" e "estou
// operando".
//
// SOME sozinho quando tudo está concluído: nenhum botão de dispensar,
// nenhuma linha no banco lembrando que alguém clicou nele. O que
// desaparece é a pendência, não a lembrança de tê-la ignorado.
//
// Também não bloqueia nada: fica acima da Central, e o produto inteiro
// continua navegável ao lado dele.
export function PrimeirosPassos({ dados }: { dados: Onboarding }) {
  if (dados.pendentes === 0) return null;

  return (
    <Card className="min-w-0">
      <CardHeader>
        <h2 className="flex flex-wrap items-center gap-2 font-heading text-base leading-snug font-medium">
          Primeiros passos
          <Badge variant="outline">
            {dados.pendentes === 1 ? "1 item pendente" : `${dados.pendentes} itens pendentes`}
          </Badge>
        </h2>
        <p className="pt-1 text-sm text-muted-foreground">
          Nada aqui é obrigatório para usar o sistema — é só o caminho mais curto para o
          seu site ficar no ar.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3 text-sm">
          {dados.passos.map((passo) => (
            <li key={passo.chave} className="flex min-w-0 items-start gap-3">
              {/* Estado em TEXTO, nunca só cor ou ícone: quem usa leitor
                  de tela precisa saber o que já está feito. */}
              <span
                aria-hidden
                className={
                  passo.concluido
                    ? "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs text-emerald-700"
                    : "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-xs text-muted-foreground"
                }
              >
                {passo.concluido ? "✓" : ""}
              </span>
              <div className="min-w-0">
                {passo.concluido ? (
                  <p className="min-w-0 break-words font-medium text-muted-foreground">
                    <span className="sr-only">Concluído: </span>
                    {passo.titulo}
                  </p>
                ) : (
                  <Link
                    href={passo.href}
                    className="min-w-0 break-words font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {passo.titulo}
                  </Link>
                )}
                <p className="min-w-0 break-words text-xs text-muted-foreground">
                  {passo.descricao}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
