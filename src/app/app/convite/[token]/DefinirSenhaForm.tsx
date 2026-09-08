"use client";

import { useActionState } from "react";
import { definirSenhaConvite } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { SENHA_MINIMA, SENHA_MAXIMA } from "@/lib/senha";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function DefinirSenhaForm({
  token,
  // Quem já tem identidade ativa (é membro de outra imobiliária) não vê
  // campo de senha nenhum: o convite aqui é para o VÍNCULO, e a senha
  // dele continua sendo dele.
  precisaDefinirSenha,
  nomeOrganizacao,
}: {
  token: string;
  precisaDefinirSenha: boolean;
  nomeOrganizacao: string | null;
}) {
  const definirComToken = definirSenhaConvite.bind(null, token);
  const [estado, formAction, pendente] = useActionState(
    definirComToken,
    ESTADO_INICIAL_ACAO
  );

  return (
    <form action={formAction} className="space-y-4">
      {precisaDefinirSenha ? (
        <div className="space-y-1.5">
          <Label htmlFor="senha">Nova senha</Label>
          <Input
            id="senha"
            name="senha"
            type="password"
            required
            minLength={SENHA_MINIMA}
            maxLength={SENHA_MAXIMA}
            // Deixa o gerenciador de senhas oferecer uma senha forte em
            // vez de o usuário reciclar a de sempre.
            autoComplete="new-password"
          />
          <p className="text-xs text-muted-foreground">
            Use ao menos {SENHA_MINIMA} caracteres. Uma frase longa é mais segura e mais
            fácil de lembrar que símbolos misturados.
          </p>
          <ErroCampo erros={estado.fieldErrors?.senha} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Você já tem uma conta no EasyMob. Aceitar não altera sua senha — apenas libera
          seu acesso {nomeOrganizacao ? `a ${nomeOrganizacao}` : "a esta imobiliária"}.
        </p>
      )}

      {estado.message && (
        <p role="alert" className="text-sm text-destructive">
          {estado.message}
        </p>
      )}

      <Button type="submit" disabled={pendente} className="w-full">
        {pendente
          ? "Ativando..."
          : precisaDefinirSenha
            ? "Ativar minha conta"
            : "Aceitar convite"}
      </Button>
    </form>
  );
}
