"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIrParaAbaCliente } from "@/components/admin/cliente/AbaClienteContext";
import type { AbaCliente } from "@/lib/cliente-abas";

// Redesenho da ficha do cliente — "Registrar atendimento"/"Relacionar
// imóvel" (card Próxima ação), "Ver todas"/"Ver todos" (resumos da Visão
// geral) e "Ver critérios atendidos" (preview compacto de recomendação)
// são todos a mesma ação: trocar de aba sem navegar. Um botão só, em vez
// de reimplementar o onClick em cada chamador.
export function BotaoIrParaAba({
  aba,
  variant = "link",
  size = "sm",
  className,
  children,
}: {
  aba: AbaCliente;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  children: React.ReactNode;
}) {
  const irPara = useIrParaAbaCliente();
  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={() => irPara(aba)}>
      {children}
    </Button>
  );
}

// Variante "ver mais" — mesmo mecanismo, estilo de link de cabeçalho de
// seção (texto + seta), para o slot `acoes` de CabecalhoSecao (ex.: "Ver
// todas"/"Ver todos (N)" na Visão geral).
export function LinkIrParaAba({
  aba,
  className,
  children,
}: {
  aba: AbaCliente;
  className?: string;
  children: React.ReactNode;
}) {
  const irPara = useIrParaAbaCliente();
  return (
    <button
      type="button"
      onClick={() => irPara(aba)}
      className={cn(
        "inline-flex items-center gap-0.5 text-sm font-medium text-blue-600 hover:underline",
        className
      )}
    >
      {children}
      <ChevronRight className="size-3.5" aria-hidden />
    </button>
  );
}
