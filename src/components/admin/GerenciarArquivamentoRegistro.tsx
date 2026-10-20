"use client";

import { useActionState, useId, useState } from "react";
import { Archive, ArchiveRestore, AlertTriangle, Trash2 } from "lucide-react";
import type { ActionState } from "@/lib/action-result";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

// Logs de Auditoria, Etapas 4/5 — componente ÚNICO para Imóveis e
// Clientes: as duas telas usam exatamente o mesmo fluxo (arquivar,
// restaurar, excluir definitivamente), só trocando o rótulo da entidade
// e a Server Action correspondente. Construir dois componentes quase
// idênticos seria duplicar a parte mais sensível desta funcionalidade
// (a confirmação digitada da exclusão).
//
// "Esconder botão é higiene; a garantia real está no servidor" — mesma
// doutrina de EmpreendimentosCard: `podeArquivar`/`podeExcluir` só
// evitam mostrar uma ação que o servidor recusaria de qualquer forma,
// nunca são a autorização em si.
type AcaoLigada = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

export function GerenciarArquivamentoRegistro({
  entidadeLabel,
  nomeDoRegistro,
  arquivadoEm,
  podeArquivar,
  podeExcluirDefinitivamente,
  acaoArquivar,
  acaoRestaurar,
  acaoExcluir,
}: {
  /** "imóvel" ou "cliente" — usado nos textos, sempre minúsculo. */
  entidadeLabel: string;
  /** Título (imóvel) ou nome (cliente) — exibido e exigido na confirmação digitada. */
  nomeDoRegistro: string;
  arquivadoEm: string | null;
  podeArquivar: boolean;
  podeExcluirDefinitivamente: boolean;
  acaoArquivar: AcaoLigada;
  acaoRestaurar: AcaoLigada;
  acaoExcluir: AcaoLigada;
}) {
  if (!podeArquivar && !podeExcluirDefinitivamente) return null;

  return (
    // min-w-0: sem isto, o form do botão Arquivar/Restaurar (que carrega
    // um parágrafo de ajuda sem quebra própria) força a largura de
    // conteúdo máxima em vez de ceder ao flex-wrap. O teto de largura em
    // telas estreitas (necessário porque o wrapper `acoes` de
    // CabecalhoPagina é shrink-0 de propósito) fica no componente que
    // monta TODAS as ações do cabeçalho juntas (ver
    // src/app/app/imoveis/[id]/page.tsx e clientes/[id]/page.tsx), não
    // aqui — este componente não sabe o que mais vai ser renderizado ao
    // seu lado.
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {arquivadoEm && (
        <Badge variant="secondary" className="gap-1">
          <Archive className="size-3" />
          Arquivado
        </Badge>
      )}

      {podeArquivar && (
        <BotaoArquivarOuRestaurar
          arquivadoEm={arquivadoEm}
          acaoArquivar={acaoArquivar}
          acaoRestaurar={acaoRestaurar}
        />
      )}

      {podeExcluirDefinitivamente && (
        <ExcluirDefinitivamenteDialog
          entidadeLabel={entidadeLabel}
          nomeDoRegistro={nomeDoRegistro}
          acaoExcluir={acaoExcluir}
        />
      )}
    </div>
  );
}

function BotaoArquivarOuRestaurar({
  arquivadoEm,
  acaoArquivar,
  acaoRestaurar,
}: {
  arquivadoEm: string | null;
  acaoArquivar: AcaoLigada;
  acaoRestaurar: AcaoLigada;
}) {
  // Reversível, ação secundária — confirmação SIMPLES (o próprio clique),
  // mesmo padrão já usado por "Excluir" em EmpreendimentosCard. A
  // mensagem de sucesso/erro aparece logo abaixo do botão, com aria-live.
  const [estado, formAction, pendente] = useActionState(
    arquivadoEm ? acaoRestaurar : acaoArquivar,
    ESTADO_INICIAL_ACAO
  );

  return (
    // min-w-0 no form e max-w-[12rem] + break-words no texto de apoio:
    // sem isso, "Reversível — pode ser restaurado a qualquer momento."
    // nunca quebra linha (flex-col não encolhe por padrão) e força a
    // largura do form — e, por tabela, de todo o bloco de ações do
    // cabeçalho — além da viewport em 320-768px (achado real, medido).
    <form action={formAction} className="flex min-w-0 flex-col gap-1">
      <Button type="submit" variant="outline" size="sm" disabled={pendente} className="gap-1.5">
        {arquivadoEm ? (
          <>
            <ArchiveRestore className="size-4" />
            {pendente ? "Restaurando..." : "Restaurar"}
          </>
        ) : (
          <>
            <Archive className="size-4" />
            {pendente ? "Arquivando..." : "Arquivar"}
          </>
        )}
      </Button>
      {!arquivadoEm && (
        <p className="max-w-48 text-xs text-muted-foreground break-words">
          Reversível — pode ser restaurado a qualquer momento.
        </p>
      )}
      {estado.message && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "max-w-48 text-xs break-words",
            estado.success ? "text-muted-foreground" : "text-destructive"
          )}
        >
          {estado.message}
        </p>
      )}
    </form>
  );
}

function ExcluirDefinitivamenteDialog({
  entidadeLabel,
  nomeDoRegistro,
  acaoExcluir,
}: {
  entidadeLabel: string;
  nomeDoRegistro: string;
  acaoExcluir: AcaoLigada;
}) {
  const [sessao, setSessao] = useState(0);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setSessao((s) => s + 1)}
      >
        <Trash2 className="size-4" />
        Excluir definitivamente
      </Button>

      {sessao > 0 && (
        <ConteudoExclusao
          key={sessao}
          entidadeLabel={entidadeLabel}
          nomeDoRegistro={nomeDoRegistro}
          acaoExcluir={acaoExcluir}
          onFechar={() => setSessao(0)}
        />
      )}
    </>
  );
}

function ConteudoExclusao({
  entidadeLabel,
  nomeDoRegistro,
  acaoExcluir,
  onFechar,
}: {
  entidadeLabel: string;
  nomeDoRegistro: string;
  acaoExcluir: AcaoLigada;
  onFechar: () => void;
}) {
  const [fechado, setFechado] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [estado, formAction, pendente] = useActionState(acaoExcluir, ESTADO_INICIAL_ACAO);
  const idConfirmacao = useId();

  // Sucesso fecha e some (a listagem/página já se revalida sozinha via
  // revalidatePath da própria Server Action) — mesmo padrão de
  // EditarClienteDialog.
  if (fechado || estado.success) {
    if (!fechado) onFechar();
    return null;
  }

  const confirmacaoValida = confirmacao.trim() === nomeDoRegistro;

  return (
    <Dialog
      open
      onOpenChange={() => {
        setFechado(true);
        onFechar();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4" />
            Excluir {entidadeLabel} definitivamente
          </DialogTitle>
          <DialogDescription>
            Esta ação é <strong>permanente e irreversível</strong> — diferente de arquivar, não será
            possível restaurar {nomeDoRegistro} pela interface depois disso. Se existirem negociações,
            interesses ou outros registros vinculados, a exclusão será recusada.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={idConfirmacao}>
              Digite <strong>{nomeDoRegistro}</strong> para confirmar
            </Label>
            <Input
              id={idConfirmacao}
              name="confirmacao"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              autoComplete="off"
              aria-invalid={estado.message && !estado.success ? true : undefined}
            />
          </div>

          {estado.message && (
            <p role="alert" className="text-sm text-destructive">
              {estado.message}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFechado(true);
                onFechar();
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={!confirmacaoValida || pendente}>
              {pendente ? "Excluindo..." : "Excluir definitivamente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
