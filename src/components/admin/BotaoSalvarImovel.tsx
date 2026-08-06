"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function BotaoSalvarImovel() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Salvando..." : "Salvar imóvel"}
    </Button>
  );
}
