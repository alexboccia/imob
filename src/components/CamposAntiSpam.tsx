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
//
// `renderizadoEm` pode ser fornecido por quem chama, e existe por um
// motivo concreto: num formulário que só é MONTADO depois de um clique
// (o bloco de materiais do imóvel), o carimbo do próprio componente
// nasceria no instante do clique, e alguém preenchendo com dados
// salvos pelo navegador ouviria "envio muito rápido" sendo humano. O
// valor certo, nesse caso, é o instante em que o BLOCO apareceu na
// tela — que é o mesmo significado que o carimbo já tinha nos
// formulários montados junto com a página. Sem o parâmetro, nada muda.
export function CamposAntiSpam({ renderizadoEm: fornecido }: { renderizadoEm?: number } = {}) {
  const [proprio] = useState(() => Date.now());
  const renderizadoEm = fornecido ?? proprio;

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
