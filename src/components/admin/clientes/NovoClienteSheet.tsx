"use client";

import { useState } from "react";
import type { VariantProps } from "class-variance-authority";
import { CriarClienteForm } from "@/components/admin/CriarClienteForm";
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

// Redesenho da tela de Clientes — substitui o <FormDisclosure> sempre
// aberto no topo da página por um botão + painel lateral. `open`
// controlado localmente (não por DrawerTrigger sozinho) porque precisamos
// fechar programaticamente quando CriarClienteForm reporta sucesso.
export function NovoClienteSheet({
  labelBotao = "Novo cliente",
  variantBotao = "default",
}: {
  /** Estado vazio da listagem reusa este mesmo componente com um rótulo
   * diferente ("Adicionar primeiro cliente") em vez de duplicar o Sheet. */
  labelBotao?: string;
  variantBotao?: VariantProps<typeof buttonVariants>["variant"];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant={variantBotao} />}>
        <PlusIcon className="size-4" />
        {labelBotao}
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Novo cliente</SheetTitle>
          <SheetDescription>
            Cadastre um lead ou cliente manualmente — os mesmos dados usados no funil de vendas.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-2">
          <CriarClienteForm envolverEmDisclosure={false} onSuccess={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
