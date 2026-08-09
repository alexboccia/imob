"use client";

import { useActionState } from "react";
import Link from "next/link";
import { criarOrganization, type EstadoCriarOrganization } from "./actions";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ESTADO_INICIAL: EstadoCriarOrganization = { success: false };

export function CriarOrganizationForm({
  planos,
}: {
  planos: { id: string; name: string }[];
}) {
  const [estado, formAction, pendente] = useActionState(
    criarOrganization,
    ESTADO_INICIAL
  );

  if (estado.success) {
    return (
      <Alert className="border-green-200 bg-green-50 text-green-700">
        <AlertDescription className="text-green-700 space-y-3">
          <p>{estado.message}</p>
          {estado.linkConvite && (
            <div className="bg-white border rounded-md p-2 text-xs break-all text-foreground">
              {estado.linkConvite}
            </div>
          )}
          <Link
            href="/platform/organizations"
            className="inline-block text-sm font-medium underline"
          >
            Ver organizations
          </Link>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">Nome da organização</Label>
        <Input id="name" name="name" required />
        <ErroCampo erros={estado.fieldErrors?.name} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" name="slug" placeholder="minha-imobiliaria" required />
        <ErroCampo erros={estado.fieldErrors?.slug} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cnpj">CNPJ (opcional)</Label>
        <Input id="cnpj" name="cnpj" />
        <ErroCampo erros={estado.fieldErrors?.cnpj} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="planId">Plano</Label>
        <select
          id="planId"
          name="planId"
          required
          className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="">Selecione...</option>
          {planos.map((plano) => (
            <option key={plano.id} value={plano.id}>
              {plano.name}
            </option>
          ))}
        </select>
        <ErroCampo erros={estado.fieldErrors?.planId} />
      </div>

      <div className="border-t pt-4 space-y-4">
        <p className="text-sm font-medium text-muted-foreground">
          Responsável (primeiro OWNER)
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="responsavelNome">Nome</Label>
          <Input id="responsavelNome" name="responsavelNome" required />
          <ErroCampo erros={estado.fieldErrors?.responsavelNome} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="responsavelEmail">E-mail</Label>
          <Input
            id="responsavelEmail"
            name="responsavelEmail"
            type="email"
            required
          />
          <ErroCampo erros={estado.fieldErrors?.responsavelEmail} />
        </div>
      </div>

      {estado.message && !estado.success && (
        <p className="text-sm text-destructive">{estado.message}</p>
      )}

      <Button type="submit" disabled={pendente} className="w-full">
        {pendente ? "Criando..." : "Criar organization e enviar convite"}
      </Button>
    </form>
  );
}
