"use client";

import { useActionState, useState } from "react";
import {
  adicionarParticipante,
  atualizarParticipante,
  removerParticipante,
} from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { formatarPreco } from "@/lib/format";
import { CampoMoeda } from "@/components/admin/CampoMoeda";
import {
  resumirDivisao,
  calcularAlocacaoPorPercentual,
  type ParticipanteExibicao,
} from "@/lib/participacao-comissao";
import {
  registrarPagamentoParticipante,
  cancelarPagamentoParticipante,
} from "@/app/app/clientes/actions";
import {
  resumirLiquidacao,
  somarPagamentosValidos,
  STATUS_LIQUIDACAO_LABEL,
  type PagamentoExibicao,
} from "@/lib/pagamento-comissao";
import type { OpcaoResponsavel, ResponsavelNegociacao } from "@/lib/responsavel-negociacao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CLASSE_CAMPO =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

// Divisão da comissão (Fase 12) — quem participa do dinheiro do negócio,
// e com quanto.
//
// NADA É AUTOMÁTICO AQUI. A lista começa vazia mesmo quando existe
// responsável e comissão registrada: conduzir a negociação não implica
// receber parcela nenhuma. O botão "Adicionar responsável" existe como
// ATALHO EXPLÍCITO — só vira fato depois que alguém clica.
//
// O saldo não distribuído é declarado, nunca atribuído a ninguém.
export function DivisaoComissao({
  interesseId,
  commissionValue,
  responsavel,
  participantes,
  pagamentosPorParticipante,
  membros,
  podeLiquidar,
}: {
  pagamentosPorParticipante: Record<string, PagamentoExibicao[]>;
  podeLiquidar: boolean;
  interesseId: string;
  // Comissão TOTAL do negócio (Fase 10). null = não registrada — não
  // existe saldo, e a tela diz isso em vez de mostrar "R$ 0".
  commissionValue: number | null;
  responsavel: ResponsavelNegociacao | null;
  participantes: ParticipanteExibicao[];
  membros: OpcaoResponsavel[];
}) {
  const [aberto, setAberto] = useState(false);

  const resumo = resumirDivisao(
    commissionValue,
    participantes.map((p) => p.alocacao)
  );

  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">
        Divisão da comissão:{" "}
        {participantes.length === 0 ? (
          <span className="italic">sem participantes</span>
        ) : (
          <span className="font-medium text-foreground">
            {participantes.length}{" "}
            {participantes.length === 1 ? "participante" : "participantes"} ·{" "}
            {formatarPreco(resumo.distribuido)} atribuídos
          </span>
        )}
        {/* null != zero: sem comissão registrada não existe saldo. */}
        {resumo.naoDistribuido !== null && resumo.naoDistribuido > 0 && (
          <> · {formatarPreco(resumo.naoDistribuido)} não distribuídos</>
        )}
      </p>

      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        Dividir comissão
      </button>

      {/* Montado só quando aberto — mesma correção da Fase 10: diálogos
          ociosos empilham camadas dismissíveis que competem entre si. */}
      {aberto && (
        <Dialog open onOpenChange={setAberto}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Divisão da comissão</DialogTitle>
              <DialogDescription>
                Quem participa da comissão deste negócio, e com quanto. Nada é dividido
                automaticamente.
              </DialogDescription>
            </DialogHeader>

            <PainelDivisao
              interesseId={interesseId}
              commissionValue={commissionValue}
              responsavel={responsavel}
              participantes={participantes}
              pagamentosPorParticipante={pagamentosPorParticipante}
              membros={membros}
              podeLiquidar={podeLiquidar}
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function PainelDivisao({
  interesseId,
  commissionValue,
  responsavel,
  participantes,
  pagamentosPorParticipante,
  membros,
  podeLiquidar,
}: {
  interesseId: string;
  commissionValue: number | null;
  responsavel: ResponsavelNegociacao | null;
  participantes: ParticipanteExibicao[];
  pagamentosPorParticipante: Record<string, PagamentoExibicao[]>;
  membros: OpcaoResponsavel[];
  podeLiquidar: boolean;
}) {
  const adicionar = adicionarParticipante.bind(null, interesseId);
  const [estadoAdicionar, formAdicionar, pendenteAdicionar] = useActionState(
    adicionar,
    ESTADO_INICIAL_ACAO
  );

  const resumo = resumirDivisao(
    commissionValue,
    participantes.map((p) => p.alocacao)
  );

  const idsParticipantes = new Set(participantes.map((p) => p.memberId));
  // Só membros ativos que ainda não estão na divisão.
  const disponiveis = membros.filter((m) => !idsParticipantes.has(m.memberId));
  const responsavelForaDaDivisao =
    responsavel !== null && !idsParticipantes.has(responsavel.memberId) && !responsavel.inativo;

  return (
    <div className="space-y-4">
      {/* ---- Totais ---- */}
      <dl className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Comissão do negócio</dt>
          <dd className="text-base font-semibold tabular-nums">
            {commissionValue === null ? "Não registrada" : formatarPreco(commissionValue)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Atribuída</dt>
          <dd className="text-base font-semibold tabular-nums">
            {formatarPreco(resumo.distribuido)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Não distribuída</dt>
          <dd className="text-base font-semibold tabular-nums">
            {/* Sem comissão registrada não há saldo — "—", jamais R$ 0,
                que afirmaria que não sobrou nada. */}
            {resumo.naoDistribuido === null ? "—" : formatarPreco(resumo.naoDistribuido)}
          </dd>
        </div>
      </dl>

      {commissionValue === null && (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          A comissão deste negócio ainda não foi registrada. Dá para anotar quem participou, mas os
          valores só podem ser atribuídos depois — sem o total não há como validar as parcelas.
        </p>
      )}

      {/* ---- Lista ---- */}
      {participantes.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          Nenhum participante ainda. Ninguém foi incluído automaticamente — nem o responsável pela
          negociação.
        </p>
      ) : (
        <ul className="space-y-2">
          {participantes.map((participante) => (
            <LinhaParticipante
              key={participante.id}
              participante={participante}
              commissionValue={commissionValue}
              pagamentos={pagamentosPorParticipante[participante.id] ?? []}
              podeLiquidar={podeLiquidar}
            />
          ))}
        </ul>
      )}

      {resumo.participantesSemParcela > 0 && (
        <p className="text-xs text-muted-foreground">
          {resumo.participantesSemParcela}{" "}
          {resumo.participantesSemParcela === 1
            ? "participante ainda não tem parcela definida e por isso não entra"
            : "participantes ainda não têm parcela definida e por isso não entram"}{" "}
          no valor atribuído — nenhuma parcela foi estimada.
        </p>
      )}

      {/* ---- Adicionar ---- */}
      <form action={formAdicionar} className="space-y-3 border-t pt-3">
        <div className="space-y-1.5">
          <Label htmlFor={`participante-${interesseId}`}>Adicionar participante</Label>
          <select
            id={`participante-${interesseId}`}
            name="memberId"
            defaultValue=""
            className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <option value="">Selecione um usuário</option>
            {disponiveis.map((membro) => (
              <option key={membro.memberId} value={membro.memberId}>
                {membro.nome}
              </option>
            ))}
          </select>
        </div>

        <CampoParcela
          id={`nova-parcela-${interesseId}`}
          commissionValue={commissionValue}
          label="Valor da participação (opcional)"
        />

        {estadoAdicionar.message && !estadoAdicionar.success && (
          <p role="alert" className="text-xs text-destructive">
            {estadoAdicionar.message}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={pendenteAdicionar || disponiveis.length === 0}>
            {pendenteAdicionar ? "Adicionando..." : "Adicionar"}
          </Button>
          {/* Atalho EXPLÍCITO, nunca automático: preenche o seletor com o
              responsável, e ainda é preciso confirmar em "Adicionar". */}
          {responsavelForaDaDivisao && (
            <button
              type="button"
              onClick={() => {
                const select = document.getElementById(
                  `participante-${interesseId}`
                ) as HTMLSelectElement | null;
                if (select) select.value = responsavel.memberId;
              }}
              className="rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Usar o responsável ({responsavel.nome})
            </button>
          )}
        </div>
        {disponiveis.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Todos os usuários ativos já participam desta divisão.
          </p>
        )}
      </form>
    </div>
  );
}

function LinhaParticipante({
  participante,
  commissionValue,
  pagamentos,
  podeLiquidar,
}: {
  participante: ParticipanteExibicao;
  commissionValue: number | null;
  pagamentos: PagamentoExibicao[];
  podeLiquidar: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [liquidando, setLiquidando] = useState(false);
  const atualizar = atualizarParticipante.bind(null, participante.id);
  const remover = removerParticipante.bind(null, participante.id);
  const [estadoAtualizar, formAtualizar, pendenteAtualizar] = useActionState(
    atualizar,
    ESTADO_INICIAL_ACAO
  );
  const [estadoRemover, formRemover, pendenteRemover] = useActionState(
    remover,
    ESTADO_INICIAL_ACAO
  );

  // Estado DERIVADO do ledger, nunca persistido: uma coluna `status`
  // divergiria do histórico no primeiro cancelamento. Cancelado sai da
  // soma (somarPagamentosValidos filtra) e continua na lista abaixo.
  const liquidacao = resumirLiquidacao(
    participante.alocacao,
    pagamentos.filter((pg) => !pg.cancelado).map((pg) => pg.valor)
  );
  const pago = somarPagamentosValidos(pagamentos);

  return (
    <li className="rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {participante.nome}
            {/* Membro desativado continua na divisão histórica, com nome.
                A parcela dele nunca é apagada nem redistribuída. */}
            {participante.inativo && (
              <span className="ml-1 text-xs font-normal text-muted-foreground">(inativo)</span>
            )}
          </p>
          <p className="text-sm tabular-nums">
            {participante.alocacao === null ? (
              <span className="text-xs italic text-muted-foreground">Parcela não definida</span>
            ) : (
              formatarPreco(participante.alocacao)
            )}
          </p>
          {/* ATRIBUÍDO != PAGO. As três grandezas aparecem juntas, em
              TEXTO — o status nunca depende só de cor. */}
          <p className="text-xs text-muted-foreground">
            Pago {formatarPreco(liquidacao.pago)} ·{" "}
            {liquidacao.pendente === null
              ? "pendente —"
              : `pendente ${formatarPreco(liquidacao.pendente)}`}{" "}
            · <span className="font-medium text-foreground">{STATUS_LIQUIDACAO_LABEL[liquidacao.status]}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditando((v) => !v)}
            className="rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {editando ? "Cancelar" : "Editar valor"}
          </button>
          {/* Só aparece quando há obrigação conhecida e ainda há saldo:
              sem parcela definida não existe teto para pagar contra, e o
              servidor recusaria de qualquer forma. */}
          {podeLiquidar && liquidacao.pendente !== null && liquidacao.pendente > 0 && (
            <button
              type="button"
              onClick={() => setLiquidando((v) => !v)}
              className="rounded-md text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {liquidando ? "Fechar" : "Registrar pagamento"}
            </button>
          )}
          <form action={formRemover}>
            <button
              type="submit"
              disabled={pendenteRemover}
              className="rounded-md text-xs font-medium text-destructive underline-offset-4 hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {pendenteRemover ? "Removendo..." : "Remover"}
            </button>
          </form>
        </div>
      </div>

      {editando && (
        <form action={formAtualizar} className="mt-3 space-y-2 border-t pt-3">
          <CampoParcela
            id={`parcela-${participante.id}`}
            commissionValue={commissionValue}
            valorInicial={participante.alocacao}
            label="Valor da participação"
          />
          {estadoAtualizar.message && !estadoAtualizar.success && (
            <p role="alert" className="text-xs text-destructive">
              {estadoAtualizar.message}
            </p>
          )}
          <Button type="submit" size="sm" disabled={pendenteAtualizar}>
            {pendenteAtualizar ? "Salvando..." : "Salvar valor"}
          </Button>
        </form>
      )}

      {liquidando && liquidacao.pendente !== null && (
        <FormularioPagamento
          participanteId={participante.id}
          saldo={liquidacao.pendente}
          atribuido={liquidacao.atribuido}
          pago={pago}
        />
      )}

      {pagamentos.length > 0 && (
        <HistoricoPagamentos pagamentos={pagamentos} podeLiquidar={podeLiquidar} />
      )}

      {estadoRemover.message && !estadoRemover.success && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {estadoRemover.message}
        </p>
      )}
    </li>
  );
}

// Registro de um pagamento REALIZADO. O contexto inteiro fica à vista
// antes de digitar: atribuído, já pago e saldo disponível.
function FormularioPagamento({
  participanteId,
  saldo,
  atribuido,
  pago,
}: {
  participanteId: string;
  saldo: number;
  atribuido: number | null;
  pago: number;
}) {
  const registrar = registrarPagamentoParticipante.bind(null, participanteId);
  const [estado, formAction, pendente] = useActionState(registrar, ESTADO_INICIAL_ACAO);
  // CAMPO VAZIO de propósito: preencher com o saldo inteiro induziria a
  // confirmar no automático uma liquidação total que ninguém conferiu.
  // O saldo aparece como TEXTO ao lado, não como valor pré-digitado.
  const [digitos, setDigitos] = useState("");

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        Atribuído {atribuido === null ? "—" : formatarPreco(atribuido)} · já pago{" "}
        {formatarPreco(pago)} · disponível{" "}
        <span className="font-medium text-foreground">{formatarPreco(saldo)}</span>
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`pagamento-valor-${participanteId}`}>Valor pago</Label>
          <CampoMoeda
            id={`pagamento-valor-${participanteId}`}
            name="valorPagamento"
            className={CLASSE_CAMPO}
            digitos={digitos}
            onDigitosChange={setDigitos}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`pagamento-data-${participanteId}`}>Data do pagamento</Label>
          <input
            id={`pagamento-data-${participanteId}`}
            name="dataPagamento"
            type="date"
            className={CLASSE_CAMPO}
          />
        </div>
      </div>

      {estado.message && !estado.success && (
        <p role="alert" className="text-xs text-destructive">
          {estado.message}
        </p>
      )}

      <p className="text-xs text-muted-foreground">
        Registre apenas pagamentos já realizados — a data não pode ser no futuro.
      </p>

      <Button type="submit" size="sm" disabled={pendente}>
        {pendente ? "Registrando..." : "Registrar pagamento"}
      </Button>
    </form>
  );
}

// Histórico do ledger. Cancelado NÃO some: fica visível e marcado, fora
// da soma — registro financeiro apagado não deixaria rastro de que
// existiu.
function HistoricoPagamentos({
  pagamentos,
  podeLiquidar,
}: {
  pagamentos: PagamentoExibicao[];
  podeLiquidar: boolean;
}) {
  return (
    <ul className="mt-3 space-y-1 border-t pt-3">
      {pagamentos.map((pagamento) => (
        <LinhaPagamento key={pagamento.id} pagamento={pagamento} podeLiquidar={podeLiquidar} />
      ))}
    </ul>
  );
}

function LinhaPagamento({
  pagamento,
  podeLiquidar,
}: {
  pagamento: PagamentoExibicao;
  podeLiquidar: boolean;
}) {
  const cancelar = cancelarPagamentoParticipante.bind(null, pagamento.id);
  const [estado, formAction, pendente] = useActionState(cancelar, ESTADO_INICIAL_ACAO);

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
      <span className={pagamento.cancelado ? "text-muted-foreground line-through" : ""}>
        <span className="font-medium tabular-nums">{formatarPreco(pagamento.valor)}</span> em{" "}
        {formatarDataCurta(pagamento.paidAtISO)}
        {pagamento.registradoPor && <> · por {pagamento.registradoPor}</>}
      </span>
      {pagamento.cancelado ? (
        // Texto, não só o risco no valor: quem usa leitor de tela precisa
        // saber que este pagamento não conta.
        <span className="text-muted-foreground">Cancelado</span>
      ) : (
        podeLiquidar && (
          <form action={formAction}>
            <button
              type="submit"
              disabled={pendente}
              className="rounded-md font-medium text-destructive underline-offset-4 hover:underline disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {pendente ? "Cancelando..." : "Cancelar"}
            </button>
          </form>
        )
      )}
      {estado.message && !estado.success && (
        <span role="alert" className="basis-full text-destructive">
          {estado.message}
        </span>
      )}
    </li>
  );
}

// Data do FATO, curta. Sem hora: o produto registra o dia do pagamento.
function formatarDataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Campo de parcela com o atalho de "%", que apenas CALCULA sobre a
// comissão total e preenche o valor — nada de percentual é persistido
// (mesma decisão da Fase 10).
function CampoParcela({
  id,
  commissionValue,
  valorInicial,
  label,
}: {
  id: string;
  commissionValue: number | null;
  valorInicial?: number | null;
  label: string;
}) {
  const paraDigitos = (valor?: number | null) =>
    valor == null ? "" : String(Math.round(valor * 100));
  const [digitos, setDigitos] = useState(() => paraDigitos(valorInicial));
  const [percentual, setPercentual] = useState("");
  const calculado = calcularAlocacaoPorPercentual(commissionValue, percentual);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <CampoMoeda
        id={id}
        name="valorParticipacao"
        className={CLASSE_CAMPO}
        digitos={digitos}
        onDigitosChange={setDigitos}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={`${id}-pct`} className="text-xs font-normal text-muted-foreground">
          Calcular por %
        </Label>
        <Input
          id={`${id}-pct`}
          inputMode="decimal"
          value={percentual}
          onChange={(e) => setPercentual(e.target.value)}
          placeholder="50"
          className="h-8 w-20"
        />
        <button
          type="button"
          disabled={calculado === null}
          onClick={() => {
            if (calculado === null) return;
            setDigitos(String(Math.round(calculado * 100)));
          }}
          className="h-8 rounded-lg border border-input px-3 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Aplicar
        </button>
        {calculado !== null && (
          <span className="text-xs text-muted-foreground">= {formatarPreco(calculado)}</span>
        )}
      </div>
    </div>
  );
}
