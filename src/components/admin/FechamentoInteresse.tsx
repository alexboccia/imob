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
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  desfechoDoImovel,
  imovelDeveTransicionar,
  DESFECHO_LABEL,
  DESFECHOS_POSSIVEIS,
  MOTIVOS_PERDA,
  MOTIVO_PERDA_LABEL,
} from "@/lib/desfecho-negocio";
import type {
  LostReason,
  PropertyInterestStage,
  PropertyPurpose,
  PropertyStatus,
} from "@/generated/prisma/client";

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
// Fase 34 — "Marcar como perdido" deixou de ser um clique só: ganhou um
// diálogo com o MOTIVO, opcional. Não é burocracia — é a única forma de
// o aprendizado da perda sobreviver, e sem estrutura ele viraria texto
// livre que nenhuma análise futura consegue ler. Continua possível
// perder sem informar motivo.
//
// Comentário original preservado: "Marcar como perdido continua um clique só — negócio perdido não tem
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
  purpose,
  propertyStatus,
  lostReason,
  closedValue,
  valorSugerido,
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
  /** Fase 34 — decide se o desfecho do imóvel é dedutível ou precisa ser perguntado. */
  purpose: PropertyPurpose;
  /** Imóvel já fora de circulação não transiciona — e a pergunta não aparece. */
  propertyStatus: PropertyStatus;
  lostReason: LostReason | null;
  closedValue?: number | null;
  /**
   * Fase 33 — valor que o diálogo de fechamento já abre preenchido.
   * Vem da última proposta registrada quando o negócio ainda não tem
   * valor fechado; é sugestão editável, nunca um valor gravado sozinho.
   */
  valorSugerido?: number | null;
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

  const [abertoPerdido, setAbertoPerdido] = useState(false);
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
                valorInicial={valorSugerido ?? closedValue}
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
        {/* O motivo em TEXTO, nunca só por cor. Ausente é ausente: nada
            é escrito quando ninguém informou. */}
        {lostReason && <> · {MOTIVO_PERDA_LABEL[lostReason]}</>}
      </p>
    );
  }

  const erroPerdido = estadoPerdido.message && !estadoPerdido.success ? estadoPerdido.message : null;

  // A pergunta só existe quando o domínio realmente não decide: imóvel
  // ambíguo E ainda disponível. Um imóvel já fora de circulação não
  // transiciona, então não há o que perguntar.
  const precisaEscolherDesfecho =
    desfechoDoImovel(purpose).tipo === "precisa_escolha" &&
    imovelDeveTransicionar(propertyStatus);

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

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive"
        disabled={pendenteGanho || pendentePerdido}
        onClick={() => setAbertoPerdido(true)}
      >
        Marcar como perdido
      </Button>

      {erroPerdido && <p className="w-full text-xs text-destructive">{erroPerdido}</p>}

      {/* O Dialog do projeto (Base UI) já cuida de foco inicial, trap,
          Esc, e devolução do foco ao gatilho ao fechar. */}
      {/* Aberto DERIVADO, sem efeito de sincronização: assim que a
          action confirma sucesso o diálogo fecha sozinho. Em erro de
          validação ele permanece aberto com a mensagem, para o corretor
          corrigir o valor sem redigitar tudo.
          Monta só quando aberto — mesmo motivo do diálogo de correção. */}
      {/* Fase 34 — POR QUE o negócio foi perdido. Opcional: o corretor
          pode fechar sem informar, e "não informado" é um estado
          honesto. O que não pode é o aprendizado virar texto livre que
          nenhuma análise futura consegue ler. */}
      {abertoPerdido && !estadoPerdido.success && (
        <Dialog open onOpenChange={(v) => !v && setAbertoPerdido(false)}>
          <DialogContent>
            <form action={formActionPerdido} className="space-y-3">
              <DialogHeader>
                <DialogTitle>Marcar como perdido</DialogTitle>
                {/* Sem repetir a frase que já está abaixo do campo: a
                    descrição identifica O QUE está sendo encerrado. */}
                <DialogDescription>
                  {imovelTitulo && clienteNome
                    ? `${imovelTitulo} — ${clienteNome}`
                    : "Esta negociação será encerrada como perdida."}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-1.5">
                <Label htmlFor={`motivo-${interesseId}`}>Motivo (opcional)</Label>
                <select
                  id={`motivo-${interesseId}`}
                  name="motivo"
                  defaultValue=""
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">Não informar</option>
                  {MOTIVOS_PERDA.map((motivo) => (
                    <option key={motivo} value={motivo}>
                      {MOTIVO_PERDA_LABEL[motivo]}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  O imóvel continua disponível — perder um negócio não tira o imóvel do ar.
                </p>
              </div>

              {estadoPerdido.message && !estadoPerdido.success && (
                <p role="alert" className="text-xs text-destructive">
                  {estadoPerdido.message}
                </p>
              )}

              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>
                  Cancelar
                </DialogClose>
                <Button type="submit" variant="destructive" disabled={pendentePerdido}>
                  {pendentePerdido ? "Salvando..." : "Marcar como perdido"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

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
            {/* Continua NÃO sugerindo nada a partir do preço anunciado
                do imóvel: preço pedido não é valor fechado, e um campo
                pré-preenchido com ele seria confirmado no automático,
                registrando um número que ninguém negociou.
                
                A ÚLTIMA PROPOSTA é outra coisa (Fase 33): é um valor que
                alguém efetivamente colocou na mesa e o corretor
                registrou. Sugerir esse número não inventa negociação
                nenhuma — só evita redigitar o que o easymob acabou de
                guardar. Continua totalmente editável, e sem proposta
                registrada o campo segue vazio como antes. */}
            {/* Fase 34 — a ÚNICA pergunta que o sistema não consegue
                responder sozinho. Um imóvel anunciado só para venda vira
                vendido; só para locação, alugado. Anunciado para os dois,
                ganhar a negociação não diz qual aconteceu — e escolher
                por conta própria gravaria um fato comercial falso.
                Radios com fieldset/legend: é uma escolha entre duas
                opções exclusivas, e o leitor de tela precisa ouvir a
                pergunta antes das respostas. */}
            {precisaEscolherDesfecho && (
              <fieldset className="min-w-0 space-y-1.5">
                <legend className="text-sm font-medium">O que aconteceu com o imóvel?</legend>
                <p className="text-xs text-muted-foreground">
                  Ele está anunciado para venda e para locação.
                </p>
                <div className="flex flex-wrap gap-4 pt-1">
                  {DESFECHOS_POSSIVEIS.map((opcao) => (
                    <span key={opcao} className="flex items-center gap-2">
                      <input
                        type="radio"
                        id={`desfecho-${interesseId}-${opcao}`}
                        name="desfecho"
                        value={opcao}
                        className="size-4"
                      />
                      <Label htmlFor={`desfecho-${interesseId}-${opcao}`} className="font-normal">
                        {DESFECHO_LABEL[opcao]}
                      </Label>
                    </span>
                  ))}
                </div>
                {estadoGanho.fieldErrors?.desfecho && (
                  <p role="alert" className="text-xs text-destructive">
                    {estadoGanho.fieldErrors.desfecho[0]}
                  </p>
                )}
              </fieldset>
            )}

            <CamposFinanceirosFechamento
              idPrefixo={`fechamento-${interesseId}`}
              valorInicial={valorSugerido}
            />

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
