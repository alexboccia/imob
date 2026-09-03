"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pipette } from "lucide-react";
import {
  gerarPreviaPaletaLogotipo,
  aplicarPaletaGerada,
} from "@/app/app/configuracoes/actions";
import { parseOklchSeguro, oklchParaHex, hexValido } from "@/lib/branding/oklch-color";
import { aplicarCorNaPaleta } from "@/lib/branding/paleta-editavel";
import { abrirContaGotas, contaGotasSuportado } from "@/lib/eyedropper";
import type { TokensTema } from "@/lib/branding/temas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErroCampo } from "@/components/admin/ErroCampo";

const SWATCHES: { chave: keyof TokensTema; label: string }[] = [
  { chave: "primary", label: "Principal" },
  { chave: "primaryHover", label: "Principal (hover)" },
  { chave: "primaryLight", label: "Principal (clara)" },
  { chave: "secondary", label: "Secundária" },
  { chave: "border", label: "Borda" },
  { chave: "onPrimary", label: "Texto sobre botão" },
];

const MENSAGEM_HEX_INVALIDO = "Informe uma cor válida no formato #RRGGBB.";

// O suporte ao conta-gotas é uma característica fixa do navegador: não
// muda em runtime, então não há nada a assinar. Definida fora do
// componente pra manter a referência estável entre renders (exigência do
// useSyncExternalStore).
function assinarNada(): () => void {
  return () => {};
}

function hexDeToken(valor: string): string {
  const oklch = parseOklchSeguro(valor);
  return oklch ? oklchParaHex(oklch) : "#000000";
}

// Texto que cada campo mostra a partir de uma paleta — é o que permite
// carregar a paleta persistida como base editável sem espalhar regra de
// formatação por vários lugares.
function rascunhosDaPaleta(paleta: TokensTema): Record<string, string> {
  return Object.fromEntries(SWATCHES.map(({ chave }) => [chave, hexDeToken(paleta[chave])]));
}

// Fluxo de 2 passos deliberado — "gerar" NUNCA salva (só chama a Server
// Action de leitura gerarPreviaPaletaLogotipo, que não grava nada no
// banco); só "Aplicar paleta" persiste, chamando aplicarPaletaGerada.
// Isto é o que garante, em nível de arquitetura, que subir um novo logo
// nunca muda o site sozinho — o usuário sempre precisa pedir a geração E
// confirmar a aplicação, dois cliques explícitos e separados.
//
// A paleta é EDITÁVEL: cada cor tem um input de hex e um conta-gotas, os
// dois escrevendo no mesmo estado. Três origens convivem sem se misturar:
//   - `paletaInicial` (prop): o que já está persistido pro tenant, vindo
//     do servidor — é o que a tela mostra ao abrir/recarregar;
//   - "Gerar novamente": substitui os campos por uma nova SUGESTÃO, que
//     continua sem ser salva;
//   - "Aplicar paleta": persiste e re-sincroniza os campos com o que a
//     action devolveu ter gravado.
//
// Sem prop de "logo configurado": as Server Actions sempre releem
// OrganizationSettings.logoUrl do banco (nunca confiam num valor do
// client) — um logo só enviado agora pelo LogoUpload ao lado (estado
// local dele, não passado pra cá) ainda não está salvo, então o botão
// abaixo sempre existe e é a própria Server Action que decide, com uma
// mensagem amigável, se há ou não um logo salvo pra analisar.
export function GeradorTemaLogotipo({
  paletaInicial,
}: {
  paletaInicial: TokensTema | null;
}) {
  // `paleta` guarda o ÚLTIMO VALOR VÁLIDO de cada cor (formato oklch) —
  // é a fonte da bolinha de prévia e a base do payload. `rascunhos`
  // guarda o TEXTO de cada campo, que pode estar temporariamente
  // incompleto enquanto se digita ("#12"). Separar os dois é o que
  // permite editar livremente sem a prévia piscar nem o valor ser
  // revertido a cada tecla.
  const [paleta, setPaleta] = useState<TokensTema | null>(paletaInicial);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>(() =>
    paletaInicial ? rascunhosDaPaleta(paletaInicial) : {}
  );
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [aplicado, setAplicado] = useState(false);
  const [gerando, startGerando] = useTransition();
  const [aplicando, startAplicando] = useTransition();
  const router = useRouter();

  // Detecção de suporte via useSyncExternalStore: `window` não existe no
  // SSR, então o snapshot do servidor é sempre `false` e o do client diz
  // a verdade — sem mismatch de hidratação e sem setState dentro de
  // efeito. O botão é renderizado nos dois casos (desabilitado quando não
  // há suporte), então isso nunca mexe no layout — só habilita.
  const suportaContaGotas = useSyncExternalStore(
    assinarNada,
    contaGotasSuportado,
    () => false
  );

  function carregarPaleta(nova: TokensTema) {
    setPaleta(nova);
    setRascunhos(rascunhosDaPaleta(nova));
    setErrosCampo({});
  }

  // Digitação: o texto sempre é aceito como está (nunca revertido). Se o
  // valor já for um hex válido, a prévia acompanha na hora; se não for, a
  // bolinha mantém a última cor válida em vez de tentar pintar lixo.
  function digitarCor(chave: keyof TokensTema, texto: string) {
    setRascunhos((atual) => ({ ...atual, [chave]: texto }));
    if (hexValido(texto)) {
      setPaleta((atual) => (atual ? aplicarCorNaPaleta(atual, chave, texto) : atual));
      // Corrigiu: o erro some sozinho, sem ficar preso da tentativa anterior.
      setErrosCampo((atual) => {
        if (!atual[chave]) return atual;
        const resto = { ...atual };
        delete resto[chave];
        return resto;
      });
    }
  }

  async function escolherCor(chave: keyof TokensTema) {
    const hex = await abrirContaGotas();
    // null = navegador sem suporte OU usuário cancelou (ESC/clique fora).
    // Nos dois casos a cor anterior fica como está, sem erro nenhum.
    if (!hex) return;
    // Escreve no MESMO estado que o input: campo, prévia e payload nunca
    // divergem entre digitar e usar o conta-gotas.
    digitarCor(chave, hex);
    setAplicado(false);
  }

  function gerar() {
    setErro(null);
    setAplicado(false);
    startGerando(async () => {
      const resultado = await gerarPreviaPaletaLogotipo();
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      // Nova SUGESTÃO: troca o que está na tela, mas não salva nada.
      carregarPaleta(resultado.tokens);
    });
  }

  function aplicar() {
    setErro(null);
    if (!paleta) return;

    // Validação de TODOS os campos antes de qualquer persistência: uma
    // cor inválida impede a aplicação inteira (nada parcial).
    const invalidos: Record<string, string> = {};
    for (const { chave } of SWATCHES) {
      if (!hexValido(rascunhos[chave] ?? "")) invalidos[chave] = MENSAGEM_HEX_INVALIDO;
    }
    if (Object.keys(invalidos).length > 0) {
      setErrosCampo(invalidos);
      setAplicado(false);
      setErro("Verifique as cores destacadas antes de aplicar.");
      return;
    }
    setErrosCampo({});

    // Monta o payload a partir do que está NOS CAMPOS (todos já válidos
    // aqui). `link` não é editável e segue junto sem alteração.
    let paraAplicar = paleta;
    for (const { chave } of SWATCHES) {
      paraAplicar = aplicarCorNaPaleta(paraAplicar, chave, rascunhos[chave]);
    }

    startAplicando(async () => {
      const resultado = await aplicarPaletaGerada(paraAplicar);
      if (!resultado.success || !resultado.tokens) {
        // Falha no servidor não pode apagar o trabalho: os campos ficam
        // exatamente como estavam pro usuário tentar de novo.
        setErro(resultado.message ?? "Não foi possível aplicar a paleta.");
        return;
      }
      // Sincroniza com o que o servidor DIZ ter gravado, não com a cópia
      // local — a tela continua visível, preenchida e editável.
      carregarPaleta(resultado.tokens);
      setAplicado(true);
      router.refresh();
    });
  }

  const ocupado = gerando || aplicando;

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
        disabled={ocupado}
        className="h-auto min-h-9 min-w-0 shrink whitespace-normal"
      >
        {gerando ? "Gerando..." : paleta ? "Gerar novamente" : "Gerar paleta do logotipo"}
      </Button>

      {erro && <p className="min-w-0 break-words text-sm text-destructive">{erro}</p>}

      {aplicado && (
        <p className="min-w-0 break-words text-sm text-success-foreground">
          Paleta personalizada aplicada.
        </p>
      )}

      {paleta && (
        <div className="min-w-0 space-y-3 rounded-lg border bg-gray-50 p-3">
          <p className="min-w-0 break-words text-sm font-medium">Paleta sugerida</p>
          <ul className="min-w-0 space-y-2">
            {SWATCHES.map(({ chave, label }) => {
              const idCampo = `cor-${chave}`;
              const idErro = `${idCampo}-erro`;
              const invalido = Boolean(errosCampo[chave]);
              return (
                <li key={chave} className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2 text-sm">
                    {/* Prévia: sempre a última cor VÁLIDA — nunca tenta
                        pintar um hex incompleto que está sendo digitado. */}
                    <span
                      aria-hidden
                      className="size-4 shrink-0 rounded-full border border-black/10"
                      style={{ backgroundColor: paleta[chave] }}
                    />
                    <label htmlFor={idCampo} className="min-w-0 flex-1 break-words">
                      {label}
                    </label>
                    <Input
                      id={idCampo}
                      value={rascunhos[chave] ?? ""}
                      onChange={(e) => digitarCor(chave, e.target.value)}
                      disabled={ocupado}
                      spellCheck={false}
                      autoComplete="off"
                      maxLength={7}
                      aria-label={`Cor ${label}`}
                      aria-invalid={invalido || undefined}
                      aria-describedby={invalido ? idErro : undefined}
                      className="w-24 shrink-0 font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => escolherCor(chave)}
                      disabled={!suportaContaGotas || ocupado}
                      aria-label={`Selecionar cor ${label} com conta-gotas`}
                      title={
                        suportaContaGotas
                          ? `Selecionar cor ${label} com conta-gotas`
                          : "Seu navegador não suporta o conta-gotas. Use o Chrome ou Edge para escolher a cor da tela."
                      }
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors outline-none hover:bg-black/5 hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                    >
                      <Pipette aria-hidden className="size-3.5" />
                    </button>
                  </div>
                  {invalido && (
                    <div id={idErro} className="pl-6">
                      <ErroCampo erros={[errosCampo[chave]]} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex min-w-0 flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={gerar}
              disabled={ocupado}
              className="h-auto min-h-9 min-w-0 shrink whitespace-normal"
            >
              Gerar novamente
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={aplicar}
              disabled={ocupado}
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
