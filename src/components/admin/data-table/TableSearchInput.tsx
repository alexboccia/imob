"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

// Extraído de DataTable.tsx (redesenho dos filtros de Imóveis) — mesma
// lógica de busca debounced, byte a byte, só relocada pra um componente
// próprio. Motivo: Imóveis precisa posicionar este campo dentro do card
// de filtros (junto de Status/Tipo/Finalidade), enquanto as outras 4
// telas que usam DataTable (Usuários, Clientes, Organizations, Audit)
// continuam recebendo o mesmo campo renderizado por DataTable — que agora
// só delega pra este componente (ver prop `hideSearchBar`), sem nenhuma
// mudança de comportamento pra elas.
export function TableSearchInput({
  id,
  placeholder = "Buscar...",
  className,
}: {
  id?: string;
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Reseta buscaLocal quando o `search` da URL muda por fora deste
  // componente (voltar no navegador, clicar num link que limpa filtros).
  // Ajustado durante o render (padrão recomendado pelo React pra "resetar
  // estado quando uma prop muda"), não num useEffect — evita o
  // cascading-render de um setState síncrono dentro de efeito.
  const searchNaUrl = searchParams.get("search") ?? "";
  const [buscaLocal, setBuscaLocal] = useState(searchNaUrl);
  const [ultimoSearchNaUrl, setUltimoSearchNaUrl] = useState(searchNaUrl);
  if (searchNaUrl !== ultimoSearchNaUrl) {
    setUltimoSearchNaUrl(searchNaUrl);
    setBuscaLocal(searchNaUrl);
  }

  // Debounce simples: só atualiza a URL (e refaz a consulta no servidor)
  // 400ms depois da última tecla, pra não disparar uma query por caractere.
  useEffect(() => {
    const atual = searchParams.get("search") ?? "";
    if (buscaLocal === atual) return;
    const timeoutId = setTimeout(() => {
      const novo = new URLSearchParams(searchParams.toString());
      if (buscaLocal) novo.set("search", buscaLocal);
      else novo.delete("search");
      novo.delete("page");
      router.push(`${pathname}?${novo.toString()}`);
    }, 400);
    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buscaLocal]);

  return (
    <Input
      id={id}
      placeholder={placeholder}
      value={buscaLocal}
      onChange={(e) => setBuscaLocal(e.target.value)}
      className={className}
    />
  );
}
