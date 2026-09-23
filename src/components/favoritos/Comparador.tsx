"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { buttonVariants } from "@/components/ui/button";
import { IconeChevronEsquerdo, IconeChevronDireito } from "@/components/icons";
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

/** Largura mínima confortável de uma coluna de imóvel, em px. */
const LARGURA_COLUNA = 240;
/** Teto de colunas simultâneas: acima disso a leitura lado a lado perde o sentido. */
const MAXIMO_VISIVEIS = 3;

/** Quantas colunas cabem em `largura`, entre 1 e MAXIMO_VISIVEIS. */
export function colunasQueCabem(largura: number): number {
  if (!Number.isFinite(largura) || largura <= 0) return 1;
  // A coluna de critérios ocupa espaço antes das colunas de imóveis.
  const disponivel = largura - LARGURA_COLUNA * 0.6;
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
                  className="min-w-0 border-b p-2 align-top"
                >
                  <CabecalhoImovel
                    imovel={imovel}
                    basePath={basePath}
                    aoRemover={() => removerDaSelecao(orgSlug, imovel.id)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          {grupos.map((grupo) => (
            <tbody key={grupo.chave} data-grupo={grupo.chave}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={janela.length + 1}
                  className="bg-muted p-2 text-left text-xs font-semibold text-muted-foreground uppercase"
                >
                  {grupo.titulo}
                </th>
              </tr>
              {grupo.linhas.map((linha) => (
                <tr key={linha.chave} data-linha={linha.chave} className="border-b">
                  {/* A coluna de critérios continua colada à esquerda
                      quando a tabela rola na horizontal. */}
                  <th
                    scope="row"
                    className="sticky left-0 z-10 bg-background p-2 text-left font-medium text-gray-700"
                  >
                    {linha.rotulo}
                  </th>
                  {linha.valores.map((valor, i) => (
                    <td key={janela[i].id} className="min-w-0 p-2 break-words">
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
    <div className="min-w-0 space-y-2 text-left font-normal">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-muted">
        {imovel.foto && (
          <Image
            src={imovel.foto}
            alt={imovel.titulo}
            fill
            sizes="240px"
            className="object-cover"
          />
        )}
      </div>
      <p className="min-w-0 truncate font-semibold text-gray-900">{imovel.titulo}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={`${basePath}/imoveis/${imovel.id}`}
          data-ver-imovel={imovel.id}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Ver imóvel
        </Link>
        {/* Sai da comparação, NUNCA dos favoritos: são estados
            diferentes, e o visitante não pode perder o que salvou ao
            organizar a comparação. */}
        <button
          type="button"
          data-remover-comparacao={imovel.id}
          onClick={aoRemover}
          aria-label={`Remover ${imovel.titulo} da comparação`}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
        >
          Remover
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
