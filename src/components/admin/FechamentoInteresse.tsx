"use client";

import { useActionState, useState } from "react";
import {
  marcarInteresseComoGanho,
  marcarInteresseComoPerdido,
  corrigirDadosFechamento,
} from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { formatarDataHoraNoFuso } from "@/lib/fuso-horario";
import { rotuloAtorTransicao, type AtorTransicao } from "@/lib/ator-transicao";
import { formatarPreco } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { CamposFinanceirosFechamento } from "@/components/admin/CamposFinanceirosFechamento";
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
// closedAtISO é um INSTANTE real (o new Date() da Server Action), não um
// horário digitado: o valor persistido continua intocado pela Fase 18 —
// só a EXIBIÇÃO passa a usar o fuso da organização. Timezone explícito
// também é o que mantém SSR e hidratação idênticos neste Client
// Component; sem ele os dois divergiriam.
export function FechamentoInteresse({
  interesseId,
  stage,
  closedAtISO,
  closedValue,
  commissionValue,
  atorFechamento,
  fuso,
  // Contexto exibido no diálogo. Opcionais: nem toda tela que reaproveita
  // este componente tem os dois à mão, e o fechamento nunca depende deles.
  imovelTitulo,
  clienteNome,
}: {
  interesseId: string;
  stage: PropertyInterestStage;
  closedAtISO: string | null;
  closedValue?: number | null;
  commissionValue?: number | null;
  // Fase 14 — quem executou a transição de FECHAMENTO. Aparece na linha
  // que já mostra "Fechado em ...", que é a superfície onde a última
  // transição de um negócio encerrado é visível (o drawer só existe para
  // negócio aberto). null = ator não registrado.
  atorFechamento?: AtorTransicao | null;
  // Fuso comercial da organização (Fase 18) — só formatação.
  fuso: string;
  imovelTitulo?: string;
  clienteNome?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);

  const correcaoAcao = corrigirDadosFechamento.bind(null, interesseId);
  const [estadoCorrecao, formActionCorrecao, pendenteCorrecao] = useActionState(
    correcaoAcao,
    ESTADO_INICIAL_ACAO
  );

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
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Ganho</span>
          {/* null = NÃO REGISTRADO (fechamento anterior a cada fase).
              Nunca mostrar "R$ 0", que afirmaria valor/comissão zero. */}
          {closedValue != null ? (
            <> — {formatarPreco(closedValue)}</>
          ) : (
            <> — Valor não registrado</>
          )}
          {commissionValue != null ? (
            <> · Comissão {formatarPreco(commissionValue)}</>
          ) : (
            <> · Comissão não registrada</>
          )}
          {closedAtISO && <> · Fechado em {formatarDataHoraNoFuso(closedAtISO, fuso)}</>}
          {closedAtISO && <> · por {rotuloAtorTransicao(atorFechamento ?? null)}</>}
        </p>

        <button
          type="button"
          onClick={() => setCorrigindo(true)}
          className="rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Corrigir valores
        </button>

        {/* MONTA SÓ QUANDO ABERTO. O Kanban do Pipeline renderiza um
            FechamentoInteresse por card, e manter um Dialog ocioso por
            card empilhava N camadas de overlay/portal na mesma página —
            além do custo, camadas dismissíveis ociosas competem com o
            Sheet da negociação (achado real: o drawer não abria de forma
            confiável na suíte completa, só com poucos cards). */}
        {corrigindo && !estadoCorrecao.success && (
        <Dialog open onOpenChange={setCorrigindo}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Corrigir valores do fechamento</DialogTitle>
              <DialogDescription>
                {imovelTitulo && clienteNome
                  ? `${imovelTitulo} — ${clienteNome}`
                  : "A negociação continua ganha; só os valores são alterados."}
              </DialogDescription>
            </DialogHeader>

            <form action={formActionCorrecao} className="space-y-3">
              <CamposFinanceirosFechamento
                idPrefixo={`correcao-${interesseId}`}
                valorInicial={closedValue}
                comissaoInicial={commissionValue}
              />

              {estadoCorrecao.message && !estadoCorrecao.success && (
                <p role="alert" className="text-xs text-destructive">
                  {estadoCorrecao.message}
                </p>
              )}

              <p className="text-xs text-muted-foreground">
                A negociação continua marcada como ganha e a data de fechamento não muda. A
                alteração fica registrada no histórico da organização.
              </p>

              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setCorrigindo(false)}
                  disabled={pendenteCorrecao}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={pendenteCorrecao}>
                  {pendenteCorrecao ? "Salvando..." : "Salvar valores"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>
    );
  }

  if (stage === "REJECTED") {
    return (
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Perdido</span>
        {closedAtISO && <> — Fechado em {formatarDataHoraNoFuso(closedAtISO, fuso)}</>}
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
          corrigir o valor sem redigitar tudo.
          Monta só quando aberto — mesmo motivo do diálogo de correção. */}
      {aberto && !estadoGanho.success && (
      <Dialog open onOpenChange={setAberto}>
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
            {/* Nenhum valor é sugerido a partir do preço anunciado do
                imóvel: preço pedido não é valor fechado, e um campo
                pré-preenchido seria confirmado no automático,
                registrando um número que ninguém negociou. */}
            <CamposFinanceirosFechamento idPrefixo={`fechamento-${interesseId}`} />

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
      )}
    </div>
  );
}
