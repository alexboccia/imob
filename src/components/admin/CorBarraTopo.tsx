"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { hexValido } from "@/lib/branding/oklch-color";
import { estiloDaBarraTopo } from "@/lib/branding/cor-barra-topo";

// Fase 58.5 — cor de fundo da FAIXA DE CONTATOS do topo.
//
// UM ÚNICO estado (`valor`) alimenta o seletor visual, o campo de texto
// e o que é enviado no formulário. Sem estados paralelos não existe a
// divergência clássica destas telas: mexer no seletor e o hex mostrar
// outra coisa, ou vice-versa.
//
// Vazio significa "sem personalização" — é o que "Usar cor padrão"
// escreve, e o que faz a action gravar null. Deliberadamente NÃO grava o
// hex da cor padrão atual: se o padrão do produto mudar um dia, quem
// nunca personalizou acompanha.

/** Cor exibida no seletor nativo quando não há personalização. */
// O <input type="color"> não tem estado "vazio": ele sempre mostra
// alguma cor. Este cinza é só o ponto de partida do seletor; enquanto o
// campo de texto estiver vazio, nada é gravado e a barra segue no visual
// padrão.
const PONTO_DE_PARTIDA = "#f5f5f5";

export function CorBarraTopo({ corInicial }: { corInicial: string | null }) {
  const [valor, setValor] = useState(corInicial ?? "");

  const personalizada = hexValido(valor);
  const previa = estiloDaBarraTopo(valor);

  return (
    <div className="min-w-0 space-y-2 border-t pt-4" data-cor-barra-topo>
      <Label htmlFor="corBarraTopo">Cor de fundo da barra superior</Label>
      <p className="text-xs text-muted-foreground">
        Personaliza o fundo da faixa de contatos exibida no topo do site. Não altera o cabeçalho
        com o logotipo e o menu.
      </p>

      <div className="flex min-w-0 flex-wrap items-center gap-3">
        {/* Seletor visual e campo de texto escrevem no MESMO estado. */}
        <input
          type="color"
          aria-label="Escolher a cor de fundo da barra superior"
          data-seletor-cor
          value={personalizada ? valor : PONTO_DE_PARTIDA}
          onChange={(e) => setValor(e.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
        />
        <Input
          id="corBarraTopo"
          name="corBarraTopo"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="#F5F5F5"
          className="w-36 shrink-0"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-restaurar-cor
          onClick={() => setValor("")}
          disabled={valor === ""}
        >
          Usar cor padrão
        </Button>
      </div>

      {/* Amostra pequena, com as cores que a barra usaria de fato — o
          fundo escolhido e o conteúdo derivado dele por contraste. */}
      {previa && (
        <p
          data-previa-cor
          className="inline-flex min-w-0 items-center rounded border px-2 py-1 text-xs"
          style={{ backgroundColor: previa.fundo, color: previa.conteudo }}
        >
          Assim ficará a faixa
        </p>
      )}
      {valor !== "" && !personalizada && (
        <p className="text-xs text-destructive" data-erro-cor>
          Use uma cor no formato #RRGGBB.
        </p>
      )}
    </div>
  );
}
