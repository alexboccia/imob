"use client";

import { useEffect, useRef } from "react";
import { atribuicaoAtual } from "@/lib/atribuicao-client";

// Campo oculto que leva a atribuição da jornada junto do formulário
// público (Fase 7) — mesmo padrão de CamposAntiSpam.
//
// Por que vai no MESMO submit, e não num request separado: o contato só
// existe quando a Interaction é criada com sucesso. Um canal separado
// abriria a porta para contato sem atribuição, ou atribuição sem
// contato, divergindo com o tempo. Indo junto, ou os dois existem ou
// nenhum.
//
// UM campo com JSON, e não seis campos: o servidor já tem um saneador
// único (sanearAtribuicaoRecebida) que recebe um objeto, e seis inputs
// espalhariam a mesma decisão por seis lugares. O servidor faz
// JSON.parse defensivo — nada aqui é confiável.
//
// O valor é escrito no DOM por um efeito (via ref), não por estado do
// React: `sessionStorage` não existe no servidor, então ler durante o
// render causaria divergência de hidratação, e guardar em estado só para
// preencher um input escondido dispararia re-render à toa. Efeito
// atualizando o DOM é exatamente o caso de uso de um efeito.
//
// FAIL-OPEN: se o sessionStorage estiver bloqueado, o campo fica vazio e
// o formulário envia normalmente. Atribuição é contexto, jamais
// requisito de conversão.
export function CamposAtribuicao() {
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!campo.current) return;
    try {
      campo.current.value = JSON.stringify(atribuicaoAtual());
    } catch {
      // Nunca propaga: falha de tracking não pode virar erro de página.
    }
  }, []);

  return (
    <input
      ref={campo}
      type="hidden"
      name="atribuicao"
      defaultValue=""
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}
