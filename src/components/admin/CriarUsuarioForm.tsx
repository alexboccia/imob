"use client";

import { useActionState, useEffect, useRef } from "react";
import { convidarUsuario } from "@/app/app/usuarios/actions";
import { FormDisclosure } from "@/components/admin/FormDisclosure";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// `envolverEmDisclosure`/`onSuccess`: mesmo padrão já adotado em
// CriarClienteForm.tsx no redesenho de Clientes. Uso original desta tela
// (inline, sempre montado na página) usava <FormDisclosure> como moldura;
// o redesenho de Usuários passou a abrir este mesmo formulário dentro de
// um Sheet (NovoUsuarioSheet) — moldura diferente, mesmos campos/
// validação/action. A action não redireciona — só devolve sucesso, e é
// este componente que reage (reseta o form, avisa o Sheet pra fechar).
//
// Fase 25 — o campo de SENHA saiu. Quem administra não escolhe mais a
// senha de ninguém: a pessoa convidada recebe um link e cria a dela.
export function CriarUsuarioForm({
  envolverEmDisclosure = true,
  onSuccess,
}: {
  envolverEmDisclosure?: boolean;
  onSuccess?: () => void;
} = {}) {
  const [estado, formAction, pendente] = useActionState(
    convidarUsuario,
    ESTADO_INICIAL_ACAO
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.success) {
      formRef.current?.reset();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.success]);

  const conteudo = (
    <form ref={formRef} action={formAction} className="grid grid-cols-2 gap-3 text-sm">
      <div>
        <Input name="nome" placeholder="Nome" required />
        <ErroCampo erros={estado.fieldErrors?.nome} />
      </div>
      <div>
        <Input name="email" type="email" placeholder="E-mail" required />
        <ErroCampo erros={estado.fieldErrors?.email} />
      </div>
      <Select name="papel" defaultValue="BROKER">
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ADMIN">Administrador</SelectItem>
          <SelectItem value="MANAGER">Gestor</SelectItem>
          <SelectItem value="BROKER">Corretor</SelectItem>
          <SelectItem value="ASSISTANT">Assistente</SelectItem>
        </SelectContent>
      </Select>
      <p className="col-span-2 text-xs text-muted-foreground">
        A pessoa recebe um e-mail para criar a própria senha. O convite vale por 7 dias.
      </p>
      {!estado.success && estado.message && (
        <p role="alert" className="col-span-2 text-sm text-destructive">
          {estado.message}
        </p>
      )}
      <Button
        type="submit"
        disabled={pendente}
        className="col-span-2 justify-self-start"
      >
        {pendente ? "Enviando convite..." : "Enviar convite"}
      </Button>
    </form>
  );

  if (!envolverEmDisclosure) return conteudo;

  return (
    <FormDisclosure titulo="+ Cadastrar novo usuário">{conteudo}</FormDisclosure>
  );
}
