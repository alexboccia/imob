"use client";

import { useActionState, useState } from "react";
import { atualizarPessoa } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoTelefone } from "@/components/CampoTelefone";
import { Button } from "@/components/ui/button";
import { ErroCampo } from "@/components/admin/ErroCampo";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ValoresCliente = {
  nome: string;
  email: string | null;
  telefone: string | null;
  observacoes: string | null;
};

// Fase 114 — a edição dos quatro campos cadastrais que criarPessoa grava
// e que, até aqui, nunca podiam ser corrigidos depois do cadastro.
//
// `sessao` incrementa a cada clique em "Editar" e vira `key` do conteúdo:
// cada abertura é um MONTE NOVO (useActionState limpo, formulário limpo),
// em vez de um `useEffect` fechando o diálogo por efeito colateral de
// `estado.success` — o fechamento em si vive só dentro do conteúdo
// (sucesso ou cancelamento), nunca precisa escrever de volta no estado
// do componente pai.
export function EditarClienteDialog({
  personId,
  valoresIniciais,
}: {
  personId: string;
  valoresIniciais: ValoresCliente;
}) {
  const [sessao, setSessao] = useState(0);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setSessao((s) => s + 1)}
      >
        Editar
      </Button>

      {sessao > 0 && (
        <ConteudoEdicao
          key={sessao}
          personId={personId}
          valoresIniciais={valoresIniciais}
        />
      )}
    </>
  );
}

function ConteudoEdicao({
  personId,
  valoresIniciais,
}: {
  personId: string;
  valoresIniciais: ValoresCliente;
}) {
  const [fechado, setFechado] = useState(false);
  const acao = atualizarPessoa.bind(null, personId);
  const [estado, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);

  // Sucesso ou cancelamento explícito encerram esta sessão — a próxima
  // vez que "Editar" for clicado, uma sessão nova (key diferente) nasce
  // com useActionState limpo, nunca reaproveitando o estado de sucesso
  // da submissão anterior.
  if (fechado || estado.success) return null;

  return (
    <Dialog open onOpenChange={() => setFechado(true)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
          <DialogDescription>
            Nome, e-mail, telefone e observações deste cliente.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="editar-cliente-nome">Nome</Label>
            <Input
              id="editar-cliente-nome"
              name="nome"
              defaultValue={valoresIniciais.nome}
              required
            />
            <ErroCampo erros={estado.fieldErrors?.nome} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="editar-cliente-email">E-mail</Label>
            <Input
              id="editar-cliente-email"
              name="email"
              type="email"
              defaultValue={valoresIniciais.email ?? ""}
            />
            <ErroCampo erros={estado.fieldErrors?.email} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="editar-cliente-telefone">Telefone</Label>
            <CampoTelefone
              id="editar-cliente-telefone"
              name="telefone"
              defaultValue={valoresIniciais.telefone}
            />
            <ErroCampo erros={estado.fieldErrors?.telefone} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="editar-cliente-observacoes">Observações</Label>
            <Input
              id="editar-cliente-observacoes"
              name="observacoes"
              defaultValue={valoresIniciais.observacoes ?? ""}
            />
            <ErroCampo erros={estado.fieldErrors?.observacoes} />
          </div>

          {estado.message && !estado.success && (
            <p role="alert" className="text-sm text-destructive">
              {estado.message}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setFechado(true)}>
              Fechar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
