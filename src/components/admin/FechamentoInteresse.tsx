"use client";

import { useActionState, useState } from "react";
import {
  marcarInteresseComoGanho,
  marcarInteresseComoPerdido,
} from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { formatarDataHora } from "@/lib/scheduled-activity-date";
import { formatarPreco } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CampoMoeda } from "@/components/admin/CampoMoeda";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PropertyInterestStage } from "@/generated/prisma/client";

// Fechamento oficial da negociação — Fase P.3, com o VALOR DE FECHAMENTO
// da Fase 9.
//
// Componente burro: decide o que renderizar a partir de stage/closedAt/
// closedValue (já carregados pela página) e aciona as duas Server
// Actions. Nenhuma lógica de tenant/Prisma aqui — quem garante isso são
// marcarInteresseComoGanho/Perdido, que revalidam tudo no servidor,
// inclusive o valor.
//
// POR QUE UM DIÁLOGO PARA O GANHO: marcar como ganho passou a ter
// consequência financeira, e um clique único num botão pequeno deixaria
// o corretor registrar um negócio sem perceber que há um valor a
// informar. O diálogo mostra o que está sendo fechado e pede o número.
// "Marcar como perdido" continua um clique só — negócio perdido não tem
// valor, e pedir confirmação ali seria atrito sem informação.
//
// closedAtISO é um evento real (o new Date() da Server Action), não um
// horário digitado — mas reaproveita formatarDataHora (UTC-literal) pelo
// mesmo motivo de sempre: este é um Client Component, o texto é gerado no
// SSR e na hidratação, e sem timezone fixo os dois divergiriam.
export function FechamentoInteresse({
  interesseId,
  stage,
  closedAtISO,
  closedValue,
  // Contexto exibido no diálogo. Opcionais: nem toda tela que reaproveita
  // este componente tem os dois à mão, e o fechamento nunca depende deles.
  imovelTitulo,
  clienteNome,
}: {
  interesseId: string;
  stage: PropertyInterestStage;
  closedAtISO: string | null;
  closedValue?: number | null;
  imovelTitulo?: string;
  clienteNome?: string;
}) {
  const [aberto, setAberto] = useState(false);

  const ganhoAcao = marcarInteresseComoGanho.bind(null, interesseId);
  const [estadoGanho, formActionGanho, pendenteGanho] = useActionState(
    ganhoAcao,
    ESTADO_INICIAL_ACAO
  );

  const perdidoAcao = marcarInteresseComoPerdido.bind(null, interesseId);
  const [estadoPerdido, formActionPerdido, pendentePerdido] = useActionState(
    perdidoAcao,
    ESTADO_INICIAL_ACAO
  );

  if (stage === "WON") {
    return (
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Ganho</span>
        {/* closedValue null = valor NÃO REGISTRADO (ganho anterior a esta
            fase). Nunca mostrar "R$ 0", que afirmaria que o negócio
            valeu zero. */}
        {closedValue != null ? (
          <> — {formatarPreco(closedValue)}</>
        ) : (
          <> — Valor não registrado</>
        )}
        {closedAtISO && <> · Fechado em {formatarDataHora(closedAtISO)}</>}
      </p>
    );
  }

  if (stage === "REJECTED") {
    return (
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Perdido</span>
        {closedAtISO && <> — Fechado em {formatarDataHora(closedAtISO)}</>}
      </p>
    );
  }

  const erroPerdido = estadoPerdido.message && !estadoPerdido.success ? estadoPerdido.message : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pendenteGanho || pendentePerdido}
        onClick={() => setAberto(true)}
      >
        Marcar como ganho
      </Button>

      <form action={formActionPerdido}>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={pendenteGanho || pendentePerdido}
        >
          {pendentePerdido ? "Salvando..." : "Marcar como perdido"}
        </Button>
      </form>

      {erroPerdido && <p className="w-full text-xs text-destructive">{erroPerdido}</p>}

      {/* O Dialog do projeto (Base UI) já cuida de foco inicial, trap,
          Esc, e devolução do foco ao gatilho ao fechar. */}
      {/* Aberto DERIVADO, sem efeito de sincronização: assim que a
          action confirma sucesso o diálogo fecha sozinho. Em erro de
          validação ele permanece aberto com a mensagem, para o corretor
          corrigir o valor sem redigitar tudo. */}
      <Dialog open={aberto && !estadoGanho.success} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marcar como ganho</DialogTitle>
            <DialogDescription>
              {imovelTitulo && clienteNome
                ? `${imovelTitulo} — ${clienteNome}`
                : "Informe o valor pelo qual a negociação foi fechada."}
            </DialogDescription>
          </DialogHeader>

          <form action={formActionGanho} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`valor-fechamento-${interesseId}`}>Valor de fechamento</Label>
              <CampoMoeda
                id={`valor-fechamento-${interesseId}`}
                name="valorFechamento"
                className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              {/* Nenhum valor é sugerido a partir do preço anunciado do
                  imóvel: preço pedido não é valor fechado, e um campo
                  pré-preenchido seria confirmado no automático,
                  registrando um número que ninguém negociou. */}
              <p className="text-xs text-muted-foreground">
                Valor negociado do imóvel. Não é comissão nem receita da imobiliária.
              </p>
            </div>

            {estadoGanho.message && !estadoGanho.success && (
              <p role="alert" className="text-xs text-destructive">
                {estadoGanho.message}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setAberto(false)}
                disabled={pendenteGanho}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pendenteGanho}>
                {pendenteGanho ? "Salvando..." : "Confirmar ganho"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
