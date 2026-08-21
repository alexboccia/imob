"use client";

import { useState } from "react";
import type { VariantProps } from "class-variance-authority";
import { CriarUsuarioForm } from "@/components/admin/CriarUsuarioForm";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PlusIcon } from "lucide-react";

// Redesenho de Usuários — substitui o <FormDisclosure> sempre aberto no
// topo da página por um botão + painel lateral, mesmo padrão de
// NovoClienteSheet no redesenho de Clientes. `open` controlado localmente
// (não só por SheetTrigger) porque precisamos fechar programaticamente
// quando CriarUsuarioForm reporta sucesso.
export function NovoUsuarioSheet({
  labelBotao = "Novo usuário",
  variantBotao = "default",
}: {
  /** Estado vazio da listagem reusa este mesmo componente com um rótulo
   * diferente ("Cadastrar primeiro usuário") em vez de duplicar o Sheet. */
  labelBotao?: string;
  variantBotao?: VariantProps<typeof buttonVariants>["variant"];
} = {}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {/* min-w-0 shrink whitespace-normal: achado direto durante o
          redesenho — em 360/375px a coluna real de conteúdo (atrás da
          sidebar fixa) tem só ~112-127px, e o botão com shrink-0 (padrão
          do design system, correto pra a maioria dos casos) forçava sua
          largura intrínseca mesmo sendo maior que isso, vazando pro
          scrollWidth do documento. Mesmo mecanismo de min-w-0 já usado
          em toda a Agenda/Pipeline, aplicado aqui só a este botão — em
          telas largas nunca quebra linha (sobra espaço de sobra), só
          quando realmente precisa. */}
      <SheetTrigger render={<Button variant={variantBotao} className="min-w-0 shrink whitespace-normal px-2 sm:px-2.5" />}>
        <PlusIcon className="size-4 shrink-0" />
        {labelBotao}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Novo usuário</SheetTitle>
          <SheetDescription>
            Cadastre um administrador, gestor, corretor ou assistente com acesso ao painel.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-2">
          <CriarUsuarioForm envolverEmDisclosure={false} onSuccess={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
