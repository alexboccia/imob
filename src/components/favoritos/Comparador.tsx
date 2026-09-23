"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { buttonVariants } from "@/components/ui/button";
import { IconeChevronEsquerdo, IconeChevronDireito, IconeFechar } from "@/components/icons";
import { formatarPreco } from "@/lib/format";
import {
  MINIMO_PARA_COMPARAR,
  removerDaSelecao,
  useSelecao,
} from "@/lib/comparador-selecao";
import {
  apenasDiferencas,
  montarComparacao,
  AUSENTE,
  type ImovelComparado,
} from "@/lib/comparador";
import { cn } from "@/lib/utils";

// =======================================================================
// Comparador (Fase 59)
// =======================================================================
// SELECIONADOS ≠ VISÍVEIS. Não existe teto de quantos imóveis o
// visitante pode comparar; existe um teto de quantas COLUNAS cabem na
// tela ao mesmo tempo. Sete selecionados com três visíveis é uma janela
// deslizante sobre os sete, não uma lista truncada — nada é descartado e
// nada pede para o visitante "escolher só três".
//
// Quantas colunas cabem é decidido pela LARGURA REAL do elemento, não
// por um breakpoint escolhido a dedo: o mesmo componente pode viver numa
// página estreita ou larga, e o que importa é o espaço que ele tem.

// Espaço que a coluna de critérios reserva antes das colunas de imóveis.
// É o MESMO valor da classe `sm:w-44` aplicada a ela (11rem = 176px):
// antes isto era uma fração da largura da coluna de imóvel, o que fazia
// a conta estimar um espaço que o CSS não usava.
const LARGURA_CRITERIOS = 176;

/**
 * Largura mínima confortável de uma coluna de imóvel, em px.
 *
 * 220 e não 240 (Fase 59.1): com o cabeçalho compacto — foto baixa,
 * tipo e bairro numa linha, preço em outra — a coluna deixou de precisar
 * de 240px para continuar legível. É essa folga que permite a quarta
 * coluna em telas largas sem espremer nada.
 */
const LARGURA_COLUNA = 220;

/**
 * Teto de colunas simultâneas. Quatro, e não mais: acima disso cada
 * coluna cai abaixo do mínimo utilizável mesmo em telas muito largas
 * (o container público é limitado a max-w-6xl), e a leitura lado a lado
 * passa a exigir varredura horizontal em vez de comparação.
 */
const MAXIMO_VISIVEIS = 4;

/**
 * Quantas colunas cabem em `largura`, entre 1 e MAXIMO_VISIVEIS.
 *
 * Continua decidindo pelo espaço REAL do container, nunca por
 * breakpoint: o mesmo componente numa página estreita mostra menos
 * colunas sem que ninguém precise listar larguras de tela. Quando quatro
 * não cabem, mostra três — a coluna nunca é comprimida para atingir um
 * número.
 */
export function colunasQueCabem(largura: number): number {
  if (!Number.isFinite(largura) || largura <= 0) return 1;
  const disponivel = largura - LARGURA_CRITERIOS;
  const cabem = Math.floor(disponivel / LARGURA_COLUNA);
  return Math.min(Math.max(cabem, 1), MAXIMO_VISIVEIS);
}

function useColunasVisiveis(elemento: HTMLElement | null): number {
  const [colunas, setColunas] = useState(1);
  useEffect(() => {
    if (!elemento) return;
    const observador = new ResizeObserver(([entrada]) => {
      setColunas(colunasQueCabem(entrada.contentRect.width));
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [elemento]);
  return colunas;
}

export function Comparador({ orgSlug, basePath }: { orgSlug: string; basePath: string }) {
  const selecao = useSelecao(orgSlug);
  const [imoveis, setImoveis] = useState<ImovelComparado[] | null>(null);
  const [erro, setErro] = useState(false);
  const [soDiferencas, setSoDiferencas] = useState(false);
  const [inicio, setInicio] = useState(0);
  const [caixa, setCaixa] = useState<HTMLElement | null>(null);
  const visiveis = useColunasVisiveis(caixa);

  const chaveSelecao = JSON.stringify(selecao ?? []);
  const selecaoVazia = selecao !== null && selecao.length === 0;

  useEffect(() => {
    const ids: string[] = JSON.parse(chaveSelecao);
    // Seleção vazia não consulta nada — e o resultado é DERIVADO abaixo,
    // não gravado por um efeito.
    if (ids.length === 0) return;
    const controle = new AbortController();
    fetch("/api/imoveis/comparar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgSlug, ids }),
      signal: controle.signal,
    })
      .then(async (resposta) => {
        if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
        const dados = (await resposta.json()) as { imoveis: ImovelComparado[] };
        // O erro só é limpo quando a resposta chega, e não ao disparar o
        // pedido: zerar antes deixaria a tela sem erro e sem dados.
        setErro(false);
        setImoveis(dados.imoveis);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        setErro(true);
      });
    return () => controle.abort();
  }, [orgSlug, chaveSelecao]);

  // Seleção vazia é resultado conhecido, não algo a buscar. Memoizado
  // para a janela abaixo não recalcular a cada render.
  const lista = useMemo(() => (selecaoVazia ? [] : imoveis), [selecaoVazia, imoveis]);
  const total = lista?.length ?? 0;

  // A janela nunca aponta para fora da lista — remover o último imóvel
  // visível recua o início. DERIVADO do estado bruto, em vez de corrigido
  // por um efeito: sem render em cascata e sem um instante em que a
  // janela aponta para o vazio.
  const inicioSeguro = Math.max(0, Math.min(inicio, Math.max(total - visiveis, 0)));

  const janela = useMemo(
    () => (lista ?? []).slice(inicioSeguro, inicioSeguro + visiveis),
    [lista, inicioSeguro, visiveis]
  );

  // As linhas descrevem SÓ os imóveis visíveis: "apenas diferenças"
  // responde sobre o que está na tela, não sobre colunas que o visitante
  // não está vendo.
  const grupos = useMemo(() => {
    const todos = montarComparacao(janela);
    return soDiferencas ? apenasDiferencas(todos) : todos;
  }, [janela, soDiferencas]);

  if (selecao === null || lista === null) {
    return <p className="text-muted-foreground">Carregando comparação…</p>;
  }

  if (erro && total === 0) {
    return (
      <div role="alert" data-comparador-erro className="rounded-xl border bg-muted p-5">
        <p className="text-gray-700">Não foi possível carregar a comparação agora.</p>
      </div>
    );
  }

  if (total < MINIMO_PARA_COMPARAR) {
    return <ComparacaoInsuficiente basePath={basePath} total={total} />;
  }

  const podeVoltar = inicioSeguro > 0;
  const podeAvancar = inicioSeguro + visiveis < total;
  const primeiroVisivel = inicioSeguro + 1;
  const ultimoVisivel = Math.min(inicioSeguro + visiveis, total);

  return (
    <div data-comparador ref={setCaixa} className="min-w-0">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium text-gray-900" data-total-comparados>
          {total} imóveis selecionados
        </p>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
          <Checkbox
            checked={soDiferencas}
            onCheckedChange={(marcado) => setSoDiferencas(marcado === true)}
            data-so-diferencas
          />
          Mostrar apenas diferenças
        </label>
      </div>

      {/* Uma tabela de verdade: cabeçalho de coluna por imóvel e
          cabeçalho de linha por critério. Quem usa leitor de tela ouve
          "Preço, Imóvel A" em vez de uma célula solta. */}
      <div className="mt-4 min-w-0 overflow-x-auto">
        <table className="w-full min-w-0 border-collapse text-sm" data-tabela-comparacao>
          <caption className="sr-only">
            Comparação de {janela.length} de {total} imóveis selecionados
          </caption>
          <thead>
            <tr>
              {/* Canto vazio: é o cruzamento dos dois eixos de
                  cabeçalho, não uma coluna sem título. */}
              <th scope="col" className="w-32 sm:w-44">
                <span className="sr-only">Critério</span>
              </th>
              {janela.map((imovel) => (
                <th
                  key={imovel.id}
                  scope="col"
                  data-coluna-imovel={imovel.id}
                  className="min-w-0 p-2 align-top"
                >
                  <CabecalhoImovel
                    imovel={imovel}
                    basePath={basePath}
                    aoRemover={() => removerDaSelecao(orgSlug, imovel.id)}
                  />
                </th>
              ))}
            </tr>
            {/* Fase 59.1 — IDENTIDADE COMPACTA, grudada no topo durante a
                rolagem. A comparação é longa: ao chegar em Características
                é preciso continuar sabendo de quem é cada coluna. Só ESTA
                linha gruda — a foto fica para trás — para o cabeçalho
                fixo não comer a viewport.
                
                `aria-hidden`: é repetição visual da coluna acima, que já
                é o cabeçalho semântico. Anunciá-la de novo faria cada
                célula ser lida com dois nomes. */}
            <tr aria-hidden="true" data-cabecalho-fixo className="sticky top-0 z-20">
              <th className="border-b bg-muted p-0" />
              {janela.map((imovel) => (
                <th
                  key={imovel.id}
                  data-identidade-fixa={imovel.id}
                  className="min-w-0 border-b bg-muted px-2 py-1.5 text-left align-middle font-normal"
                >
                  <p className="min-w-0 truncate text-xs text-muted-foreground">
                    {[imovel.tipo, imovel.bairro].filter(Boolean).join(" · ")}
                  </p>
                  <p className="min-w-0 truncate text-sm font-semibold text-gray-900">
                    {formatarPreco(imovel.preco ?? imovel.precoAluguel)}
                  </p>
                </th>
              ))}
            </tr>
          </thead>
          {grupos.map((grupo) => (
            <tbody key={grupo.chave} data-grupo={grupo.chave}>
              <tr>
                {/* Faixa do grupo: separa sem gastar altura — uma linha
                    baixa, em caixa alta e com espaçamento de letra, que
                    se reconhece de relance sem virar um bloco. */}
                <th
                  scope="colgroup"
                  colSpan={janela.length + 1}
                  className="sticky left-0 border-y bg-secondary px-2 py-1 text-left text-[11px] font-semibold tracking-wide text-secondary-foreground uppercase"
                >
                  {grupo.titulo}
                </th>
              </tr>
              {grupo.linhas.map((linha) => (
                <tr key={linha.chave} data-linha={linha.chave} className="border-b">
                  {/* A COLUNA DE CRITÉRIOS é o eixo de leitura da tabela
                      e precisa se distinguir dos valores: fundo próprio,
                      borda à direita e largura garantida. Sem isso a
                      linha vira "R$ 4.500.000 | R$ 3.200.000" sem que
                      "Preço" salte aos olhos.
                      
                      `sticky left-0` mantém o critério visível quando a
                      tabela rola na horizontal — e o fundo opaco é o que
                      impede o valor de aparecer por baixo dele. */}
                  <th
                    scope="row"
                    data-criterio={linha.chave}
                    className="sticky left-0 z-10 w-32 border-r bg-muted/60 px-2 py-1.5 text-left text-xs font-semibold text-gray-700 sm:w-44 sm:text-sm"
                  >
                    {linha.rotulo}
                  </th>
                  {linha.valores.map((valor, i) => (
                    <td key={janela[i].id} className="min-w-0 px-2 py-1.5 text-sm break-words">
                      {linha.tipo === "booleano" ? (
                        // Nunca só a cor: o símbolo tem texto acessível
                        // ao lado dele.
                        <span>
                          <span aria-hidden="true">{valor.bruto ? "✓" : AUSENTE}</span>
                          <span className="sr-only">{valor.texto}</span>
                        </span>
                      ) : (
                        valor.texto
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>

      {soDiferencas && grupos.length === 0 && (
        <p className="mt-4 text-muted-foreground" data-sem-diferencas>
          Os imóveis exibidos não têm diferenças nos dados comparados.
        </p>
      )}

      {total > visiveis && (
        <nav
          aria-label="Navegar entre os imóveis comparados"
          className="mt-4 flex min-w-0 items-center justify-between gap-3"
        >
          <button
            type="button"
            data-comparar-anteriores
            onClick={() => setInicio(Math.max(0, inicioSeguro - visiveis))}
            disabled={!podeVoltar}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            <IconeChevronEsquerdo className="size-4" aria-hidden="true" />
            Anteriores
          </button>
          <p className="text-sm text-muted-foreground" data-intervalo-comparacao>
            {primeiroVisivel}–{ultimoVisivel} de {total}
          </p>
          <button
            type="button"
            data-comparar-proximos
            onClick={() =>
              setInicio(Math.min(Math.max(total - visiveis, 0), inicioSeguro + visiveis))
            }
            disabled={!podeAvancar}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Próximos
            <IconeChevronDireito className="size-4" aria-hidden="true" />
          </button>
        </nav>
      )}

      <Link
        href={`${basePath}/favoritos`}
        data-voltar-favoritos
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mt-6")}
      >
        Voltar aos favoritos
      </Link>
    </div>
  );
}

function CabecalhoImovel({
  imovel,
  basePath,
  aoRemover,
}: {
  imovel: ImovelComparado;
  basePath: string;
  aoRemover: () => void;
}) {
  return (
    <div className="min-w-0 space-y-1.5 text-left font-normal">
      {/* ALTURA FIXA, não proporção (Fase 59.1). Com `aspect-[4/3]` a
          foto crescia junto com a coluna — 237px numa tela de 1440 —, e
          no comparador a fotografia serve para RECONHECER o imóvel; a
          exploração visual é a ficha. Altura fixa também mantém todas as
          colunas alinhadas entre si, seja qual for a largura.
          `object-cover` preserva o enquadramento sem distorcer. */}
      <div className="relative h-32 w-full overflow-hidden rounded-lg bg-muted sm:h-40">
        {imovel.foto && (
          <Image
            src={imovel.foto}
            alt={imovel.titulo}
            fill
            sizes="220px"
            className="object-cover"
          />
        )}
      </div>

      {/* Tipo e bairro numa linha só: é o que identifica o imóvel de
          relance, sem gastar a altura que o título inteiro gastaria. */}
      <p className="min-w-0 truncate text-xs text-muted-foreground">
        {[imovel.tipo, imovel.bairro].filter(Boolean).join(" · ")}
      </p>
      {/* `line-clamp-2` corta VISUALMENTE; o texto continua inteiro no
          DOM, então leitor de tela e `title` mostram o nome completo. */}
      <p className="line-clamp-2 min-w-0 text-sm font-semibold text-gray-900" title={imovel.titulo}>
        {imovel.titulo}
      </p>
      <p className="min-w-0 truncate text-sm font-semibold text-gray-900">
        {formatarPreco(imovel.preco ?? imovel.precoAluguel)}
      </p>

      <div className="flex flex-wrap items-center gap-1">
        <Link
          href={`${basePath}/imoveis/${imovel.id}`}
          data-ver-imovel={imovel.id}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 px-2 text-xs")}
        >
          Ver imóvel
        </Link>
        {/* Sai da comparação, NUNCA dos favoritos: são estados
            diferentes, e o visitante não pode perder o que salvou ao
            organizar a comparação. O rótulo virou ícone para caber na
            coluna estreita — o nome acessível continua completo. */}
        <button
          type="button"
          data-remover-comparacao={imovel.id}
          onClick={aoRemover}
          aria-label={`Remover ${imovel.titulo} da comparação`}
          title={`Remover ${imovel.titulo} da comparação`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-7 w-7 p-0")}
        >
          <IconeFechar className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ComparacaoInsuficiente({ basePath, total }: { basePath: string; total: number }) {
  return (
    <div
      data-comparacao-insuficiente
      className="rounded-xl border border-dashed p-6 text-center"
    >
      <p className="font-medium text-gray-900">
        {total === 0
          ? "Nenhum imóvel selecionado para comparar."
          : "Só um imóvel ficou na comparação."}
      </p>
      <p className="mt-2 text-muted-foreground">
        Selecione pelo menos {MINIMO_PARA_COMPARAR} imóveis nos seus favoritos.
      </p>
      <Link
        href={`${basePath}/favoritos`}
        data-voltar-favoritos
        className={cn(buttonVariants(), "mt-6")}
      >
        Voltar aos favoritos
      </Link>
    </div>
  );
}
