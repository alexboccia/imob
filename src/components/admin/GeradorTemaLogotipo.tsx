"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  gerarPreviaPaletaLogotipo,
  aplicarPaletaGerada,
} from "@/app/app/configuracoes/actions";
import { parseOklchSeguro, oklchParaHex } from "@/lib/branding/oklch-color";
import type { TokensTema } from "@/lib/branding/temas";
import { Button } from "@/components/ui/button";

const SWATCHES: { chave: keyof TokensTema; label: string }[] = [
  { chave: "primary", label: "Principal" },
  { chave: "primaryHover", label: "Principal (hover)" },
  { chave: "primaryLight", label: "Principal (clara)" },
  { chave: "secondary", label: "Secundária" },
  { chave: "border", label: "Borda" },
  { chave: "onPrimary", label: "Texto sobre botão" },
];

function hexDeToken(valor: string): string {
  const oklch = parseOklchSeguro(valor);
  return oklch ? oklchParaHex(oklch) : "#000000";
}

// Fluxo de 2 passos deliberado — "gerar" NUNCA salva (só chama a Server
// Action de leitura gerarPreviaPaletaLogotipo, que não grava nada no
// banco); só "Aplicar paleta" persiste, chamando aplicarPaletaGerada.
// Isto é o que garante, em nível de arquitetura, que subir um novo logo
// nunca muda o site sozinho — o usuário sempre precisa pedir a geração E
// confirmar a aplicação, dois cliques explícitos e separados.
//
// Sem prop de "logo configurado": as Server Actions sempre releem
// OrganizationSettings.logoUrl do banco (nunca confiam num valor do
// client) — um logo só enviado agora pelo LogoUpload ao lado (estado
// local dele, não passado pra cá) ainda não está salvo, então o botão
// abaixo sempre existe e é a própria Server Action que decide, com uma
// mensagem amigável, se há ou não um logo salvo pra analisar. Evita um
// bug real de estado obsoleto: gatear por uma prop vinda do servidor no
// carregamento da página faria o botão continuar escondido mesmo logo
// depois de um upload bem-sucedido, até a página recarregar.
export function GeradorTemaLogotipo() {
  const [previa, setPrevia] = useState<TokensTema | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aplicado, setAplicado] = useState(false);
  const [gerando, startGerando] = useTransition();
  const [aplicando, startAplicando] = useTransition();
  const router = useRouter();

  function gerar() {
    setErro(null);
    setAplicado(false);
    startGerando(async () => {
      const resultado = await gerarPreviaPaletaLogotipo();
      if (!resultado.ok) {
        setErro(resultado.erro);
        setPrevia(null);
        return;
      }
      setPrevia(resultado.tokens);
    });
  }

  function aplicar() {
    setErro(null);
    startAplicando(async () => {
      const resultado = await aplicarPaletaGerada();
      if (!resultado.success) {
        setErro(resultado.message ?? "Não foi possível aplicar a paleta.");
        return;
      }
      setAplicado(true);
      setPrevia(null);
      router.refresh();
    });
  }

  return (
    <div className="min-w-0 space-y-3 rounded-lg border p-4">
      <div className="min-w-0 space-y-1">
        <p className="min-w-0 break-words text-sm font-medium">
          🎨 Gerar tema pelo logotipo
        </p>
        <p className="min-w-0 break-words text-sm text-muted-foreground">
          Crie automaticamente uma combinação de cores baseada na
          identidade visual da sua imobiliária.
        </p>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={gerar}
        disabled={gerando || aplicando}
        className="h-auto min-h-9 min-w-0 shrink whitespace-normal"
      >
        {gerando ? "Gerando..." : previa ? "Gerar novamente" : "Gerar paleta do logotipo"}
      </Button>

      {erro && <p className="min-w-0 break-words text-sm text-destructive">{erro}</p>}

      {aplicado && !previa && (
        <p className="min-w-0 break-words text-sm text-success-foreground">
          Paleta personalizada aplicada.
        </p>
      )}

      {previa && (
        <div className="min-w-0 space-y-3 rounded-lg border bg-gray-50 p-3">
          <p className="min-w-0 break-words text-sm font-medium">Paleta sugerida</p>
          <ul className="min-w-0 space-y-1.5">
            {SWATCHES.map(({ chave, label }) => (
              <li key={chave} className="flex min-w-0 items-center gap-2 text-sm">
                <span
                  aria-hidden
                  className="size-4 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: previa[chave] }}
                />
                <span className="min-w-0 flex-1 break-words">{label}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {hexDeToken(previa[chave])}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex min-w-0 flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={gerar}
              disabled={gerando || aplicando}
              className="h-auto min-h-9 min-w-0 shrink whitespace-normal"
            >
              Gerar novamente
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={aplicar}
              disabled={gerando || aplicando}
              className="h-auto min-h-9 min-w-0 shrink whitespace-normal"
            >
              {aplicando ? "Aplicando..." : "Aplicar paleta"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
