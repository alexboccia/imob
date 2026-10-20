"use client";

import { createContext, useContext } from "react";
import type { AbaCliente } from "@/lib/cliente-abas";

// Redesenho da ficha do cliente — permite que um botão nascido dentro de
// uma aba (Server Component, ex: "Registrar atendimento" na Visão geral)
// troque para outra aba (ex: Histórico) sem navegar para outra URL. O
// Provider vive em ClienteAbas (a única "use client" que conhece o
// estado da aba ativa); qualquer descendente — mesmo vindo de uma árvore
// renderizada no servidor — pode consumir o contexto, porque React só
// exige um Provider ancestral na árvore final, não que cada nó
// intermediário seja "use client".
const AbaClienteContext = createContext<((aba: AbaCliente) => void) | null>(null);

export function AbaClienteProvider({
  irPara,
  children,
}: {
  irPara: (aba: AbaCliente) => void;
  children: React.ReactNode;
}) {
  return <AbaClienteContext.Provider value={irPara}>{children}</AbaClienteContext.Provider>;
}

export function useIrParaAbaCliente() {
  const irPara = useContext(AbaClienteContext);
  // Fora do Provider (ex: mesmo componente reusado numa tela sem abas) —
  // no-op silencioso em vez de lançar, porque isto não é um erro de
  // programação: é o componente sendo reusado fora do contexto de abas.
  return irPara ?? (() => {});
}
