import fs from "node:fs";
import path from "node:path";

// =======================================================================
// Famílias de rotas do site público — uma fonte de verdade
// =======================================================================
// O site público mora em `src/app/[orgSlug]/...`, e a organização
// principal é servida SEM o slug na URL. Isso exige, hoje, uma lista de
// rewrites (`/imoveis` -> `/{slug}/imoveis`), e essa lista era escrita à
// mão — dá para criar uma rota nova e ela responder 404 na organização
// principal, que é exatamente onde ela mais importa. Aconteceu com
// /corretores/[id]: só o E2E pegou.
//
// POR QUE A LISTA NÃO PODE VIRAR UM REWRITE GENÉRICO
//
// A forma em array de `rewrites()` é `afterFiles`, e a documentação do
// Next (node_modules/next/dist/docs/.../rewrites.md) é explícita quanto à
// ordem: afterFiles são checados DEPOIS dos arquivos estáticos e das
// páginas não-dinâmicas, mas ANTES das rotas dinâmicas. Um rewrite
// genérico `/:path*` -> `/{principal}/:path*` venceria a rota dinâmica
// `[orgSlug]` e transformaria `/outra-org/imoveis` em
// `/{principal}/outra-org/imoveis` — quebrando o multi-tenant por
// caminho, que é como toda organização não-principal é servida.
//
// E `fallback` (checado só antes do 404) também não resolve: um caminho
// de UM segmento como `/imoveis` CASA com a rota dinâmica `[orgSlug]`
// (vira "organização de slug imoveis", que não existe, e devolve 404 por
// notFound()) — ou seja, nunca chega ao fallback. A regra por família,
// portanto, é necessária.
//
// A SOLUÇÃO É GERAR A LISTA, NÃO ESCREVÊ-LA
//
// Este módulo descobre as famílias lendo o próprio sistema de arquivos —
// a mesma verdade que o roteador usa. Rota nova passa a ser servida na
// organização principal por existir, não por alguém lembrar.
//
// Isto roda em BUILD TIME: `next.config.ts` é avaliado pelo carregador de
// configuração do Next e os rewrites são compilados para
// `.next/routes-manifest.json` (verificado: as 7 entradas atuais estão lá
// como `afterFiles`). O runtime de produção lê o manifest, nunca este
// arquivo — então não há leitura de disco servindo requisição.

export const DIRETORIO_ROTAS_PUBLICAS = path.join("src", "app", "[orgSlug]");

/** Converte um segmento de diretório do App Router em segmento de rota. */
function segmentoParaRota(segmento: string): string | null {
  // Grupo de rotas — não aparece na URL.
  if (segmento.startsWith("(") && segmento.endsWith(")")) return null;
  // Catch-all opcional: [[...slug]] cobre também o caminho vazio.
  if (segmento.startsWith("[[...") && segmento.endsWith("]]")) {
    return `:${segmento.slice(5, -2)}*`;
  }
  if (segmento.startsWith("[...") && segmento.endsWith("]")) {
    return `:${segmento.slice(4, -1)}*`;
  }
  if (segmento.startsWith("[") && segmento.endsWith("]")) {
    return `:${segmento.slice(1, -1)}`;
  }
  return segmento;
}

/**
 * Todas as famílias de rota públicas, no formato de `source` de rewrite:
 * "/", "/imoveis", "/imoveis/:id", "/corretores/:id"...
 *
 * Só `page.tsx` conta: é o que gera página navegável. `layout.tsx`,
 * `actions.ts` e arquivos de metadata (icon, opengraph-image) não são
 * rotas que alguém digita, e continuam sendo resolvidos pelo caminho
 * completo com slug, como já eram.
 */
export function descobrirFamiliasPublicas(raiz: string): string[] {
  const familias: string[] = [];

  function andar(diretorio: string, segmentos: string[]) {
    let entradas: fs.Dirent[];
    try {
      entradas = fs.readdirSync(diretorio, { withFileTypes: true });
    } catch {
      return;
    }

    if (entradas.some((e) => e.isFile() && e.name === "page.tsx")) {
      familias.push(segmentos.length === 0 ? "/" : `/${segmentos.join("/")}`);
    }

    for (const entrada of entradas) {
      if (!entrada.isDirectory()) continue;
      // Pasta privada do App Router: nunca vira rota.
      if (entrada.name.startsWith("_")) continue;
      const segmento = segmentoParaRota(entrada.name);
      andar(
        path.join(diretorio, entrada.name),
        segmento === null ? segmentos : [...segmentos, segmento]
      );
    }
  }

  andar(raiz, []);
  // Ordem estável: o manifest de build não deve variar entre máquinas.
  return familias.sort();
}

/**
 * Os rewrites que servem a organização principal na raiz.
 *
 * Falha ALTO quando nada é encontrado: uma lista vazia derrubaria o site
 * público inteiro em 404, e é melhor quebrar o build do que publicar
 * isso. É a única maneira de a geração falhar, e ela falha antes de
 * chegar a produção.
 */
export function rewritesDoSitePublico(
  slugPrincipal: string,
  raiz: string = DIRETORIO_ROTAS_PUBLICAS
): { source: string; destination: string }[] {
  const familias = descobrirFamiliasPublicas(raiz);
  if (familias.length === 0) {
    throw new Error(
      `Nenhuma rota pública encontrada em ${raiz} — o site público inteiro ficaria 404. ` +
        "Verifique o diretório antes de continuar o build."
    );
  }

  return familias.map((familia) => ({
    source: familia,
    destination: familia === "/" ? `/${slugPrincipal}` : `/${slugPrincipal}${familia}`,
  }));
}

/**
 * Primeiro segmento de cada família — os nomes que NENHUMA organização
 * pode usar como slug, sob pena de ficar inacessível: o rewrite vence a
 * rota dinâmica e sequestraria os caminhos dela.
 *
 * Alimenta o teste de paridade de SLUGS_RESERVADOS (reserved-words.ts).
 * A lista de lá continua estática de propósito — ela é lida em runtime
 * pelo cadastro, e ler disco ali seria trocar um risco por outro.
 */
export function primeirosSegmentosPublicos(raiz: string = DIRETORIO_ROTAS_PUBLICAS): string[] {
  const nomes = descobrirFamiliasPublicas(raiz)
    .filter((familia) => familia !== "/")
    .map((familia) => familia.split("/")[1])
    // Segmento dinâmico não é nome fixo: não há o que reservar.
    .filter((segmento) => segmento && !segmento.startsWith(":"));
  return [...new Set(nomes)].sort();
}
