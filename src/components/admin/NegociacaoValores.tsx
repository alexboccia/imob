"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { registrarProposta } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import {
  LADO_PROPOSTA_LABEL,
  LADOS_PROPOSTA,
  situacaoDaNegociacao,
  type PropostaRegistrada,
} from "@/lib/proposta-negociacao";
import { formatarPreco } from "@/lib/format";
import { formatarDataHoraNoFuso } from "@/lib/fuso-horario";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CampoMoeda } from "@/components/admin/CampoMoeda";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

// Negociação de valores — o bloco que faltava na negociação.
//
// Responde, sem o corretor precisar lembrar: quanto se pede pelo imóvel,
// qual foi o último valor, quem propôs, quando, e de quem é a vez. As
// quatro primeiras são fatos gravados; a última é DERIVADA da sequência
// (ver situacaoDaNegociacao) — não existe coluna de status, porque quem
// propôs por último está, por definição, esperando o outro lado.
//
// O histórico é cronológico e não colapsa contraproposta em "versão": a
// sequência É a história da negociação.

const CLASSE_CAMPO =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function NegociacaoValores({
  interesseId,
  propostas,
  precoPedido,
  encerrada,
  fuso,
}: {
  interesseId: string;
  /** Da mais recente para a mais antiga — a ordem vem do servidor. */
  propostas: PropostaRegistrada[];
  precoPedido: number | null;
  encerrada: boolean;
  fuso: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [erros, setErros] = useState<Record<string, string[]>>({});
  const [pendente, iniciar] = useTransition();

  const situacao = situacaoDaNegociacao(propostas, encerrada);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formData = new FormData(evento.currentTarget);
    iniciar(async () => {
      const estado = await registrarProposta(interesseId, ESTADO_INICIAL_ACAO, formData);
      if (estado.success) {
        setErros({});
        setAberto(false);
        toast.success(estado.message ?? "Proposta registrada.");
      } else {
        setErros(estado.fieldErrors ?? {});
        if (!estado.fieldErrors) toast.error(estado.message ?? "Não foi possível registrar.");
      }
    });
  }

  const idLado = `proposta-lado-${interesseId}`;
  const idValor = `proposta-valor-${interesseId}`;

  return (
    <div data-negociacao-valores className="mt-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-sm font-medium">Negociação</h4>
        {/* CONTEXTO, não cópia: o preço continua vivendo no imóvel, e a
            finalidade decide qual deles ler. */}
        {precoPedido && (
          <p className="text-xs text-muted-foreground">
            Pedido: <span className="font-medium">{formatarPreco(precoPedido)}</span>
          </p>
        )}
      </div>

      {situacao.ultima ? (
        <>
          <p data-ultima-proposta className="mt-2 text-sm">
            <span className="font-semibold">{formatarPreco(situacao.ultima.valor)}</span>{" "}
            <span className="text-muted-foreground">
              · {LADO_PROPOSTA_LABEL[situacao.ultima.lado]} ·{" "}
              {formatarDataHoraNoFuso(situacao.ultima.ocorridoEmISO, fuso)}
            </span>
          </p>
          {/* Estado atual em TEXTO, nunca só por cor. */}
          {situacao.aguardando && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Aguardando resposta: {LADO_PROPOSTA_LABEL[situacao.aguardando]}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          Nenhuma proposta registrada nesta negociação.
        </p>
      )}

      {situacao.total > 1 && (
        <ol className="mt-3 border-t pt-2 text-xs">
          {propostas.slice(1).map((p) => (
            <li key={p.id} className="flex flex-wrap items-baseline gap-x-2 py-1">
              <span className="font-medium tabular-nums">{formatarPreco(p.valor)}</span>
              <span className="text-muted-foreground">{LADO_PROPOSTA_LABEL[p.lado]}</span>
              <span className="text-muted-foreground">
                {formatarDataHoraNoFuso(p.ocorridoEmISO, fuso)}
              </span>
              {p.registradoPor && (
                <span className="text-muted-foreground">· registrada por {p.registradoPor}</span>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* Negociação encerrada não recebe proposta nova — a action recusa,
          e a UI não oferece. */}
      {!encerrada && (
        <Dialog
          open={aberto}
          onOpenChange={(v) => {
            setAberto(v);
            if (!v) setErros({});
          }}
        >
          <DialogTrigger render={<Button type="button" size="sm" variant="outline" />}>
            Registrar proposta
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={enviar}>
              <DialogHeader>
                <DialogTitle>Registrar proposta</DialogTitle>
                <DialogDescription>
                  O valor que foi proposto nesta negociação. Uma contraproposta é uma
                  proposta nova — o histórico guarda a sequência.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 py-4">
                <div className="space-y-1.5">
                  <Label htmlFor={idLado}>Quem propôs</Label>
                  <select
                    id={idLado}
                    name="lado"
                    defaultValue="CLIENT"
                    className={CLASSE_CAMPO}
                    aria-invalid={erros.lado ? true : undefined}
                    aria-describedby={erros.lado ? `${idLado}-erro` : undefined}
                  >
                    {LADOS_PROPOSTA.map((lado) => (
                      <option key={lado} value={lado}>
                        {LADO_PROPOSTA_LABEL[lado]}
                      </option>
                    ))}
                  </select>
                  {erros.lado && (
                    <p id={`${idLado}-erro`} className="text-sm text-destructive">
                      {erros.lado[0]}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={idValor}>Valor proposto</Label>
                  <CampoMoeda id={idValor} name="valor" className={CLASSE_CAMPO} />
                  {erros.valor && (
                    <p id={`${idValor}-erro`} className="text-sm text-destructive">
                      {erros.valor[0]}
                    </p>
                  )}
                </div>
              </div>

              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>
                  Cancelar
                </DialogClose>
                <Button type="submit" disabled={pendente}>
                  {pendente ? "Registrando..." : "Registrar"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
