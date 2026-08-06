"use client";

import { useActionState } from "react";
import { criarPessoa } from "@/app/admin/clientes/actions";
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

const estadoInicial = { sucesso: false, erro: undefined as string | undefined };

export function CriarClienteForm() {
  const [estado, formAction, pendente] = useActionState(criarPessoa, estadoInicial);

  return (
    <FormDisclosure titulo="+ Cadastrar novo cliente/lead">
      <form action={formAction} className="grid grid-cols-2 gap-3 text-sm">
        <Input name="nome" placeholder="Nome" required />
        <CampoTelefone name="telefone" placeholder="Telefone/WhatsApp" />
        <Input name="email" type="email" placeholder="E-mail" />
        <Select name="papel" defaultValue="LEAD">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LEAD">Lead</SelectItem>
            <SelectItem value="CLIENTE">Cliente</SelectItem>
            <SelectItem value="PROPRIETARIO">Proprietário</SelectItem>
          </SelectContent>
        </Select>
        <Select name="origem">
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SITE">Site</SelectItem>
            <SelectItem value="INDICACAO">Indicação</SelectItem>
            <SelectItem value="PORTAL">Portal</SelectItem>
            <SelectItem value="INSTAGRAM">Instagram</SelectItem>
            <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
            <SelectItem value="OUTRO">Outro</SelectItem>
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
    </FormDisclosure>
  );
}
