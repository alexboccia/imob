"use client";

import { useActionState } from "react";
import { criarUsuario } from "@/app/admin/usuarios/actions";
import { FormDisclosure } from "@/components/admin/FormDisclosure";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const estadoInicial = { sucesso: false, erro: undefined as string | undefined };

export function CriarUsuarioForm() {
  const [estado, formAction, pendente] = useActionState(criarUsuario, estadoInicial);

  return (
    <FormDisclosure titulo="+ Cadastrar novo usuário">
      <form action={formAction} className="grid grid-cols-2 gap-3 text-sm">
        <Input name="nome" placeholder="Nome" required />
        <Input name="email" type="email" placeholder="E-mail" required />
        <Input
          name="senha"
          type="password"
          placeholder="Senha (mín. 6 caracteres)"
          required
          minLength={6}
        />
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
