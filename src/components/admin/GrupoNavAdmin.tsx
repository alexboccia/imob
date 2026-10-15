"use client";

import { useId, useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ICONES_NAV } from "@/components/admin/icones-nav";
import { itemAtivo, type ItemNavAdmin } from "@/lib/nav-grupos";

// Reorganização do menu lateral — item individual (link ativo, ou span
// desabilitado com selo "Pro" para módulo fora do plano), compartilhado
// por sidebar desktop e menu mobile: o mesmo markup nos dois garante que
// os testes que contam ícones/links não precisam saber qual superfície
// está olhando.
export function ItemNavLinkAdmin({
  item,
  pathname,
  onNavigate,
}: {
  item: ItemNavAdmin;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icone = ICONES_NAV[item.icone];

  if (!item.liberado) {
    return (
      <span
        title="Disponível em planos superiores"
        className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-gray-400"
      >
        <Icone aria-hidden className="size-[18px] shrink-0" />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <Badge variant="secondary" className="text-[10px]">
          Pro
        </Badge>
      </span>
    );
  }

  const ativo = itemAtivo(pathname, item.href);

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      // aria-current é o que comunica "você está aqui" a leitor de
      // tela: o fundo e o peso da fonte abaixo não chegam lá.
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        ativo
          ? // Peso da fonte + cor + fundo juntos: a cor não é o único
            // sinal do item atual.
            "bg-primary/10 font-medium text-primary"
          : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
      )}
    >
      {/* O ícone herda a cor do texto (sem `text-*` próprio) — é o que o
          mantém como apoio do rótulo em vez de concorrer com ele,
          inclusive no estado ativo. */}
      <Icone aria-hidden className="size-[18px] shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
    </Link>
  );
}

// =======================================================================
// Preferência de grupo aberto/fechado — localStorage via
// useSyncExternalStore, mesmo padrão já estabelecido em
// src/lib/favoritos-store.ts: o servidor não conhece o storage
// ("getServerSnapshot" devolve sempre expandido, cumprindo "grupos
// inicialmente expandidos" e evitando divergência de hidratação), e um
// evento próprio avisa esta mesma aba quando o botão grava uma escolha
// nova (o evento nativo "storage" só dispara em OUTRAS abas).
// =======================================================================

const EVENTO_PREFERENCIA_GRUPO = "easymob:menu-grupo-alterado";

function chavePreferencia(titulo: string): string {
  return `easymob:menu-grupo:${titulo}`;
}

function lerPreferencia(titulo: string): boolean {
  try {
    return window.localStorage.getItem(chavePreferencia(titulo)) !== "fechado";
  } catch {
    // Navegação privada, storage bloqueado etc. — grupo continua
    // expandido (o padrão), sem preferência persistida.
    return true;
  }
}

function salvarPreferencia(titulo: string, aberto: boolean): void {
  try {
    window.localStorage.setItem(chavePreferencia(titulo), aberto ? "aberto" : "fechado");
  } catch {
    // Persistir é um extra, nunca um requisito para o menu funcionar.
  }
  window.dispatchEvent(new Event(EVENTO_PREFERENCIA_GRUPO));
}

function inscreverPreferencia(aoMudar: () => void) {
  window.addEventListener("storage", aoMudar);
  window.addEventListener(EVENTO_PREFERENCIA_GRUPO, aoMudar);
  return () => {
    window.removeEventListener("storage", aoMudar);
    window.removeEventListener(EVENTO_PREFERENCIA_GRUPO, aoMudar);
  };
}

function usePreferenciaGrupo(titulo: string): boolean {
  return useSyncExternalStore(
    inscreverPreferencia,
    () => lerPreferencia(titulo),
    () => true
  );
}

// Categoria recolhível do menu lateral.
export function GrupoNavAdmin({
  titulo,
  itens,
  pathname,
  onNavigate,
}: {
  titulo: string;
  itens: ItemNavAdmin[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const preferenciaAberto = usePreferenciaGrupo(titulo);
  const idConteudo = useId();

  // Rota ativa dentro deste grupo força a exibição expandida — "quando
  // uma rota estiver ativa, seu grupo deve permanecer identificável e
  // acessível" (requisito aprovado) — mas NUNCA reescreve a preferência
  // salva: ao navegar para fora, o grupo volta a respeitar o que o
  // usuário escolheu.
  const grupoContemAtivo = itens.some((item) => itemAtivo(pathname, item.href));
  const expandido = preferenciaAberto || grupoContemAtivo;

  return (
    <div>
      <button
        type="button"
        onClick={() => salvarPreferencia(titulo, !preferenciaAberto)}
        aria-expanded={expandido}
        aria-controls={idConteudo}
        // Ajuste fino aprovado: 10px/semibold/uppercase, título e seta em
        // extremidades opostas da MESMA linha (justify-between), nunca
        // centralizado. whitespace-nowrap no título + shrink-0 na seta —
        // nenhum dos dois cede espaço ao outro; a seta nunca fica espremida
        // nem o título é cortado, porque o próprio nome do grupo foi
        // escolhido (seção de título abaixo) para caber nesta largura.
        className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-[10px] font-semibold whitespace-nowrap text-gray-500 uppercase tracking-wide hover:text-gray-700 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span>{titulo}</span>
        <ChevronDown
          aria-hidden
          className={cn("size-3.5 shrink-0 transition-transform", expandido ? "rotate-0" : "-rotate-90")}
        />
      </button>
      {expandido && (
        <div id={idConteudo} className="space-y-1">
          {itens.map((item) => (
            <ItemNavLinkAdmin key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
