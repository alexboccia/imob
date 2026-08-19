"use client";

import { useActionState, useEffect, useRef } from "react";
import { criarPessoa } from "@/app/app/clientes/actions";
import { FormDisclosure } from "@/components/admin/FormDisclosure";
import { Input } from "@/components/ui/input";
import { CampoTelefone } from "@/components/CampoTelefone";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const estadoInicial = { sucesso: false, erro: undefined as string | undefined, clienteId: undefined as string | undefined };

// `envolverEmDisclosure`: uso original desta tela (inline, sempre montado
// na página) usava <FormDisclosure> como moldura. O redesenho da tela de
// Clientes passou a abrir este mesmo formulário dentro de um Sheet
// (NovoClienteSheet) — moldura diferente, mesmos campos/validação/action.
// `onSuccess`: chamado depois que criarPessoa devolve sucesso (a action
// não redireciona mais, ver comentário nela) — usado pelo Sheet pra se
// fechar; sem consumidor (uso original), simplesmente não faz nada.
export function CriarClienteForm({
  envolverEmDisclosure = true,
  onSuccess,
}: {
  envolverEmDisclosure?: boolean;
  onSuccess?: () => void;
} = {}) {
  const [estado, formAction, pendente] = useActionState(criarPessoa, estadoInicial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.sucesso) {
      formRef.current?.reset();
      onSuccess?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.sucesso, estado.clienteId]);

  const formulario = (
      <form ref={formRef} action={formAction} className="grid grid-cols-2 gap-3 text-sm">
        <Input name="nome" placeholder="Nome" required />
        <CampoTelefone name="telefone" placeholder="Telefone/WhatsApp" />
        <Input name="email" type="email" placeholder="E-mail" />
        <Select name="papel" defaultValue="LEAD">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LEAD">Lead</SelectItem>
            <SelectItem value="CLIENT">Cliente</SelectItem>
            <SelectItem value="OWNER">Proprietário</SelectItem>
          </SelectContent>
        </Select>
        <Select name="origem">
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="WEBSITE">Site</SelectItem>
            <SelectItem value="REFERRAL">Indicação</SelectItem>
            <SelectItem value="PORTAL">Portal</SelectItem>
            <SelectItem value="INSTAGRAM">Instagram</SelectItem>
            <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
            <SelectItem value="OTHER">Outro</SelectItem>
          </SelectContent>
        </Select>
        <Input name="observacoes" placeholder="Observações" className="col-span-2" />
        {estado.erro && (
          <p className="col-span-2 text-sm text-destructive">{estado.erro}</p>
        )}
        <Button
          type="submit"
          disabled={pendente}
          className="col-span-2 justify-self-start"
        >
          {pendente ? "Cadastrando..." : "Cadastrar"}
        </Button>
      </form>
  );

  if (!envolverEmDisclosure) return formulario;

  return <FormDisclosure titulo="+ Cadastrar novo cliente/lead">{formulario}</FormDisclosure>;
}
