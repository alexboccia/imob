"use client";

import { useActionState } from "react";
import { criarPlatformOperator } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function CriarOperatorForm() {
  const [estado, formAction, pendente] = useActionState(
    criarPlatformOperator,
    ESTADO_INICIAL_ACAO
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" name="name" required />
        <ErroCampo erros={estado.fieldErrors?.name} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required />
        <ErroCampo erros={estado.fieldErrors?.email} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="senha">Senha inicial</Label>
        <Input id="senha" name="senha" type="password" required minLength={8} />
        <ErroCampo erros={estado.fieldErrors?.senha} />
      </div>
      {estado.message && (
        <p className={estado.success ? "text-sm text-green-600" : "text-sm text-destructive"}>
          {estado.message}
        </p>
      )}
      <Button type="submit" disabled={pendente} className="w-full">
        {pendente ? "Criando..." : "Criar operador"}
      </Button>
    </form>
  );
}
