"use client";

import { useActionState } from "react";
import { solicitarCadastro } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function CadastroForm() {
  const [estado, formAction, pendente] = useActionState(
    solicitarCadastro,
    ESTADO_INICIAL_ACAO
  );

  // Sucesso substitui o formulário: o próximo passo não está mais nesta
  // tela, está na caixa de e-mail. Deixar o formulário à vista convidaria
  // a reenviar e criar um segundo pedido que invalida o primeiro.
  if (estado.success) {
    return (
      <div role="status" className="space-y-2 text-sm">
        <p className="font-medium">Confirme seu e-mail para continuar.</p>
        <p className="text-muted-foreground">
          Enviamos um link de confirmação. Ele vale por 24 horas e só pode ser usado uma
          vez. Verifique também a caixa de spam.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="nomeImobiliaria">Nome da imobiliária</Label>
        <Input id="nomeImobiliaria" name="nomeImobiliaria" required maxLength={120} />
        <p className="text-xs text-muted-foreground">
          É o nome que aparece no seu site — e o endereço dele é criado a partir dele.
        </p>
        <ErroCampo erros={estado.fieldErrors?.nomeImobiliaria} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nomeResponsavel">Seu nome</Label>
        <Input
          id="nomeResponsavel"
          name="nomeResponsavel"
          required
          maxLength={120}
          autoComplete="name"
        />
        <ErroCampo erros={estado.fieldErrors?.nomeResponsavel} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Seu e-mail</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
        <ErroCampo erros={estado.fieldErrors?.email} />
      </div>

      {estado.message && !estado.success && (
        <p role="alert" className="text-sm text-destructive">
          {estado.message}
        </p>
      )}

      <Button type="submit" disabled={pendente} className="w-full">
        {pendente ? "Enviando..." : "Criar minha conta"}
      </Button>
    </form>
  );
}
