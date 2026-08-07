"use client";

import { useState } from "react";

// Honeypot + carimbo de tempo — dois sinais leves anti-bot que não pedem
// nada do usuário real e não afetam acessibilidade:
// - "website": campo que só um preenchedor automático de formulário
//   preenche. Fica fora da ordem de tab (tabIndex=-1) e fora da árvore de
//   acessibilidade (aria-hidden), então nenhum usuário de teclado/leitor
//   de tela jamais encontra ou precisa entender esse campo.
// - "renderizadoEm": marca quando o formulário apareceu pro usuário: uma
//   submissão que chega poucos segundos depois disso quase certamente não
//   foi um humano preenchendo o formulário.
export function CamposAntiSpam() {
  const [renderizadoEm] = useState(() => Date.now());

  return (
    <>
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        defaultValue=""
        className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden"
      />
      <input type="hidden" name="renderizadoEm" value={renderizadoEm} />
    </>
  );
}
