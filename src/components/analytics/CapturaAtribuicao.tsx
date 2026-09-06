"use client";

import { useEffect } from "react";
import { capturarAtribuicao } from "@/lib/atribuicao-client";

// Captura a atribuição da jornada (Fase 7). Não renderiza nada.
//
// Fica no layout do site público, e não em cada página, porque a
// atribuição é da JORNADA: o visitante pode chegar por qualquer rota
// (home, listagem, imóvel, /contato, /anuncie) e a origem precisa ser
// registrada na primeira página que ele abrir, seja qual for. Rodar em
// cada navegação também é o que permite detectar uma nova campanha no
// meio da visita (ver decidirAtribuicao).
//
// Client component de propósito: UTM e document.referrer só existem no
// navegador. E, como todo o tracking desta fase, é fail-open — se o
// sessionStorage estiver bloqueado, capturarAtribuicao devolve null e a
// página segue exatamente igual.
export function CapturaAtribuicao() {
  useEffect(() => {
    capturarAtribuicao();
  });

  return null;
}
