"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Pipette, RotateCcw, Sparkles } from "lucide-react";
import { gerarPreviaPaletaLogotipo } from "@/app/app/configuracoes/actions";
import { parseOklchSeguro, oklchParaHex, hexValido } from "@/lib/branding/oklch-color";
import {
  aplicarCorNaPaleta,
  campoCorDaChave,
  CHAVES_COR_EDITAVEIS,
  ROTULOS_COR_EDITAVEL,
  type ChaveCorEditavel,
} from "@/lib/branding/paleta-editavel";
import { abrirContaGotas, contaGotasSuportado } from "@/lib/eyedropper";
import { CATALOGO_TEMAS, TEMA_PADRAO_ID, type TokensTema } from "@/lib/branding/temas";
import { publicarPaleta } from "@/lib/branding/canal-previa-tema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErroCampo } from "@/components/admin/ErroCampo";

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
  return Object.fromEntries(CHAVES_COR_EDITAVEIS.map((chave) => [chave, hexDeToken(paleta[chave])]));
}

// =======================================================================
// Editor das cores do tema personalizado
// =======================================================================
// Fase 62 reorganizou este bloco, que era uma LISTA VERTICAL de seis
// linhas ("Paleta sugerida") mais dois botões redundantes ("Gerar
// novamente" + "Aplicar paleta"). Agora é uma grade horizontal — 6
// controles em desktop, 3 em tablet, 2 em mobile — e duas ações: gerar
// pelo logotipo e restaurar as cores padrão.
//
// A MUDANÇA DE FUNDO É QUEM PERSISTE. Antes, "Aplicar paleta" chamava a
// Server Action aplicarPaletaGerada e gravava na hora — a tela tinha dois
// botões de salvar com escopos diferentes, e era fácil ajustar uma cor,
// clicar em "Salvar alterações" e perder o ajuste. Agora as seis cores são
// CAMPOS DO FORMULÁRIO (inputs com `name`, ver campoCorDaChave), então
// quem grava é o "Salvar alterações" global, como todo o resto da tela.
//
// O que NÃO mudou:
//   - gerar NUNCA salva: gerarPreviaPaletaLogotipo é só leitura, e subir
//     um logotipo continua não podendo mexer no site sozinho;
//   - aplicarPaletaGerada continua existindo e testada — ver
//     tests/integration/paleta-logotipo.test.ts. Perdeu o botão, não a
//     lógica: é o caminho programático de persistir uma paleta;
//   - `link` segue fora da UI, derivado de `primary` no servidor.
//
// Sem prop de "logo configurado": a Server Action sempre relê
// OrganizationSettings.logoUrl do banco (nunca confia num valor do
// client), então o botão de gerar sempre existe e é ela que decide, com
// uma mensagem amigável, se há um logotipo salvo para analisar.
export function GeradorTemaLogotipo({
  paletaInicial,
}: {
  paletaInicial: TokensTema | null;
}) {
  // `paleta` guarda o ÚLTIMO VALOR VÁLIDO de cada cor (formato oklch) —
  // é a fonte da amostra e do que o preview recebe. `rascunhos` guarda o
  // TEXTO de cada campo, que pode estar temporariamente incompleto
  // enquanto se digita ("#12"). Separar os dois é o que permite editar
  // livremente sem a amostra piscar nem o valor ser revertido a cada
  // tecla.
  const [paleta, setPaleta] = useState<TokensTema | null>(paletaInicial);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>(() =>
    paletaInicial ? rascunhosDaPaleta(paletaInicial) : {}
  );
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, startGerando] = useTransition();

  // Detecção de suporte via useSyncExternalStore: `window` não existe no
  // SSR, então o snapshot do servidor é sempre `false` e o do client diz
  // a verdade — sem mismatch de hidratação e sem setState dentro de
  // efeito. O botão é renderizado nos dois casos (desabilitado quando não
  // há suporte), então isso nunca mexe no layout — só habilita.
  const suportaContaGotas = useSyncExternalStore(assinarNada, contaGotasSuportado, () => false);

  function carregarPaleta(nova: TokensTema) {
    setPaleta(nova);
    setRascunhos(rascunhosDaPaleta(nova));
    setErrosCampo({});
    // O preview é irmão deste card, não filho: o canal de evento é o que
    // o avisa sem transformar um dos dois em estado do outro.
    publicarPaleta(nova);
  }

  // Digitação: o texto sempre é aceito como está (nunca revertido). Se o
  // valor já for um hex válido, a amostra e o preview acompanham na hora;
  // se não for, a amostra mantém a última cor válida em vez de tentar
  // pintar lixo.
  function digitarCor(chave: ChaveCorEditavel, texto: string) {
    setRascunhos((atual) => ({ ...atual, [chave]: texto }));

    if (!hexValido(texto)) {
      // Sinaliza na hora, mas NÃO reverte o texto nem a última cor válida:
      // "#12" a caminho de "#123456" é um estado legítimo de digitação. O
      // campo fica marcado e a action ignora a paleta incompleta em vez de
      // gravar metade dela.
      setErrosCampo((atual) => ({ ...atual, [chave]: MENSAGEM_HEX_INVALIDO }));
      return;
    }

    setPaleta((atual) => {
      const base = atual ?? CATALOGO_TEMAS[TEMA_PADRAO_ID];
      const nova = aplicarCorNaPaleta(base, chave, texto);
      // `link` acompanha `primary` — mesma regra do catálogo e do gerador.
      const comLink = chave === "primary" ? { ...nova, link: nova.primary } : nova;
      publicarPaleta(comLink);
      return comLink;
    });
    // Corrigiu: o erro some sozinho, sem ficar preso da tentativa anterior.
    setErrosCampo((atual) => {
      if (!atual[chave]) return atual;
      const resto = { ...atual };
      delete resto[chave];
      return resto;
    });
  }

  async function escolherCor(chave: ChaveCorEditavel) {
    const hex = await abrirContaGotas();
    // null = navegador sem suporte OU usuário cancelou (ESC/clique fora).
    // Nos dois casos a cor anterior fica como está, sem erro nenhum.
    if (!hex) return;
    // Escreve no MESMO estado que o input: campo, amostra, preview e
    // FormData nunca divergem entre digitar e usar o conta-gotas.
    digitarCor(chave, hex);
  }

  function gerar() {
    setErro(null);
    startGerando(async () => {
      const resultado = await gerarPreviaPaletaLogotipo();
      if (!resultado.ok) {
        setErro(resultado.erro);
        return;
      }
      // Nova SUGESTÃO nos campos — nada salvo. O usuário revisa e decide
      // pelo "Salvar alterações".
      carregarPaleta(resultado.tokens);
    });
  }

  function restaurar() {
    setErro(null);
    // "Padrão" é o tema padrão do catálogo, que é literalmente o que a
    // organização veria sem nenhuma personalização.
    carregarPaleta(CATALOGO_TEMAS[TEMA_PADRAO_ID]);
  }

  return (
    <div className="min-w-0 space-y-4 rounded-lg border p-4" data-editor-cores>
      <div className="min-w-0 space-y-1">
        <p className="flex min-w-0 items-center gap-1.5 break-words text-sm font-medium">
          <Sparkles aria-hidden className="size-4 shrink-0 text-primary" />
          Personalize as cores do seu tema
        </p>
        <p className="min-w-0 break-words text-sm text-muted-foreground">
          Defina as cores principais do seu site. As mudanças aparecem na
          prévia na hora e são gravadas quando você salvar.
        </p>
      </div>

      {/* 2 colunas em mobile, 3 em tablet, 6 em desktop — é o que troca a
          antiga pilha de seis linhas por uma faixa baixa. minmax(0,1fr)
          em todas para o hex de largura fixa nunca empurrar a grade e
          criar rolagem horizontal. */}
      <div className="grid min-w-0 grid-cols-2 items-stretch gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {CHAVES_COR_EDITAVEIS.map((chave) => {
          const label = ROTULOS_COR_EDITAVEL[chave];
          const idCampo = `cor-${chave}`;
          const idErro = `${idCampo}-erro`;
          const invalido = Boolean(errosCampo[chave]);
          const texto = rascunhos[chave] ?? "";

          return (
            // flex-col + o rótulo em flex-1: "Texto sobre a primária" ocupa
            // duas linhas onde "Bordas" ocupa uma, e sem isto a amostra do
            // vizinho ficava desalinhada da linha dos outros controles.
            <div key={chave} className="flex h-full min-w-0 flex-col gap-1.5">
              <label
                htmlFor={idCampo}
                className="block min-w-0 flex-1 break-words text-xs leading-tight font-medium text-muted-foreground"
              >
                {label}
              </label>
              <div className="flex min-w-0 items-center gap-1.5">
                {/* Amostra: sempre a última cor VÁLIDA — nunca tenta
                    pintar um hex incompleto que está sendo digitado. */}
                <span
                  aria-hidden
                  data-amostra-cor={chave}
                  className="size-5 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: paleta ? paleta[chave] : "transparent" }}
                />
                <Input
                  id={idCampo}
                  // É ESTE input que viaja no FormData — não há campo
                  // escondido duplicando o valor.
                  name={campoCorDaChave(chave)}
                  value={texto}
                  onChange={(e) => digitarCor(chave, e.target.value)}
                  disabled={gerando}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={7}
                  aria-label={`Cor ${label}`}
                  aria-invalid={invalido || undefined}
                  aria-describedby={invalido ? idErro : undefined}
                  className="min-w-0 flex-1 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={() => escolherCor(chave)}
                  disabled={!suportaContaGotas || gerando}
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
                <div id={idErro}>
                  <ErroCampo erros={[errosCampo[chave]]} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {erro && <p className="min-w-0 break-words text-sm text-destructive">{erro}</p>}

      <div className="flex min-w-0 flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={gerar}
          disabled={gerando}
          className="h-auto min-h-9 min-w-0 shrink whitespace-normal"
        >
          <Sparkles aria-hidden className="size-4" />
          {gerando ? "Gerando..." : "Gerar tema pelo logotipo"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={restaurar}
          disabled={gerando}
          className="h-auto min-h-9 min-w-0 shrink whitespace-normal"
        >
          <RotateCcw aria-hidden className="size-4" />
          Restaurar cores padrão
        </Button>
      </div>
    </div>
  );
}
