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
  resetToken,
}: {
  id?: string;
  placeholder?: string;
  className?: string;
  /**
   * Incrementado por quem limpa os filtros. Existe por causa de um bug
   * real e reproduzido: entre a digitação e o disparo do debounce (400ms)
   * há uma janela em que a busca ainda NÃO está na URL. Se "Limpar
   * filtros" for clicado nessa janela, `searchNaUrl` continua "" (nunca
   * chegou a mudar), o reset por comparação abaixo não dispara, o texto
   * permanece no campo — e pior: o timer pendente ainda vai disparar e
   * REAPLICAR a busca que o usuário acabou de limpar.
   *
   * Comparar a query string inteira resolveria isso, mas quebraria a
   * digitação: um push atrasado de "a" clobbaria o "ab" já digitado. Por
   * isso o sinal é explícito, e não inferido da URL.
   */
  resetToken?: number;
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

  // Mesmo padrão de ajuste-durante-o-render: um reset explícito vindo de
  // fora. Zerar `buscaLocal` aqui também CANCELA o timer pendente — o
  // efeito abaixo tem [buscaLocal] nas deps, então a limpeza roda e o
  // novo passe encontra buscaLocal === atual e não agenda nada.
  const [ultimoResetToken, setUltimoResetToken] = useState(resetToken);
  if (resetToken !== ultimoResetToken) {
    setUltimoResetToken(resetToken);
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
