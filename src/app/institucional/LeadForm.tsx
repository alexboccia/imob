"use client";

import { useActionState } from "react";
import { solicitarDemonstracao } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

// `renderizadoEm` vem do Server Component pai (page.tsx), calculado uma
// única vez quando a página é servida — nunca com Date.now() aqui dentro:
// chamar uma função impura durante o render quebra a regra de pureza de
// render do React (mesmo motivo documentado em [orgSlug]/actions.ts
// sobre o limiar de 1.5s, só que resolvido do lado do componente).
export function LeadForm({ renderizadoEm }: { renderizadoEm: number }) {
  const [estado, formAction, pendente] = useActionState(solicitarDemonstracao, ESTADO_INICIAL_ACAO);

  if (estado.success) {
    return (
      <div role="status" className="rounded-lg border bg-muted/30 p-6 text-sm">
        <p className="font-medium">Pedido recebido!</p>
        <p className="mt-1 text-muted-foreground">
          Entraremos em contato pelo WhatsApp ou e-mail informado para combinar o melhor
          horário da sua demonstração.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* Honeypot — invisível pra humanos, preenchido só por bot. */}
      <div className="hidden" aria-hidden="true">
        <Label htmlFor="website">Deixe em branco</Label>
        <Input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <input type="hidden" name="renderizadoEm" value={renderizadoEm} />

      <div className="space-y-1.5">
        <Label htmlFor="nome">Seu nome</Label>
        <Input id="nome" name="nome" required maxLength={120} autoComplete="name" />
        <ErroCampo erros={estado.fieldErrors?.nome} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">E-mail profissional</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
        <ErroCampo erros={estado.fieldErrors?.email} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="whatsapp">WhatsApp</Label>
        <Input id="whatsapp" name="whatsapp" required autoComplete="tel" placeholder="(11) 99999-9999" />
        <ErroCampo erros={estado.fieldErrors?.whatsapp} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="nomeImobiliaria">Nome da imobiliária</Label>
        <Input id="nomeImobiliaria" name="nomeImobiliaria" required maxLength={120} />
        <ErroCampo erros={estado.fieldErrors?.nomeImobiliaria} />
      </div>

      {estado.message && !estado.success && (
        <p role="alert" className="text-sm text-destructive">
          {estado.message}
        </p>
      )}

      <Button type="submit" disabled={pendente} className="w-full" size="lg">
        {pendente ? "Enviando..." : "Agendar demonstração"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Sem compromisso · seus dados são usados só para agendar esta demonstração.
      </p>
    </form>
  );
}
