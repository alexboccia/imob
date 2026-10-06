// Render do criativo (MKT-001) — ÚNICO arquivo desta feature que faz I/O
// e usa `sharp`. Node-only, nunca importado de um Client Component (mesma
// regra de hero-image-processar.ts/extrair-paleta-logo.ts — sharp não
// roda no browser). Recebe só strings/números JÁ resolvidos pelo chamador
// (route.ts): este módulo não decide finalidade, não escolhe preço, não
// consulta banco — só desenha o que mandarem desenhar.
import sharp from "sharp";
import type { FormatoAnuncio } from "@/lib/anuncio-imovel";

// Mesmo teto de LIMITE_TAMANHO_BYTES.imagem (upload-validation.ts): a
// foto/logo já está armazenada no R2 por um upload que passou por essa
// mesma validação, então um arquivo maior que isto aqui só pode ser
// resposta inesperada — nunca uma foto real do produto.
const TAMANHO_MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 8_000;
const LIMITE_PIXELS_ENTRADA = 60_000_000; // mesmo teto de hero-image-processar.ts

async function buscarBytesSeguro(url: string): Promise<Buffer | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let resposta: Response;
    try {
      resposta = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!resposta.ok) return null;

    const contentLength = resposta.headers.get("content-length");
    if (contentLength && Number(contentLength) > TAMANHO_MAX_BYTES) return null;

    const arrayBuffer = await resposta.arrayBuffer();
    if (arrayBuffer.byteLength > TAMANHO_MAX_BYTES) return null;
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

// Escapa texto livre (título do imóvel, bairro, nome da organização) antes
// de entrar no SVG — nenhum desses campos é controlado pelo produto, e um
// "&"/"<" cru quebraria o XML (e, sem isto, seria injeção de SVG).
function escaparSvg(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export type DadosAnuncio = {
  // Linha estrutural, já formatada e filtrada por quem chama
  // (montarItensUnidade sem os itens de catálogo) — nunca "0 vagas".
  itens: string[];
  finalidadeLabel: string;
  precoFormatado: string | null; // null = não mostra a linha de preço
  // null = não mostra a linha de localização. Ausente é ausente (mesma
  // regra do preço) — nunca usado pela MKT-001 (sempre uma string), só
  // pelos slides "foto" do carrossel (MKT-002), que deliberadamente
  // omitem a localização pra ficar discretos.
  localizacao: string | null;
  nomeOrganizacao: string;
  whatsapp: string | null; // já validado (temWhatsApp) por quem chama
  // MKT-002 — opcional, default true: o selo de finalidade (badge
  // branco "À VENDA"/"PARA ALUGAR") é o elemento mais "pesado" do
  // overlay. Slides intermediários do carrossel (papel "foto") o
  // omitem de propósito (seção 8: "identidade visual discreta, não
  // repetir um painel pesado em todas as imagens"). Ausente aqui
  // sempre significa true — a MKT-001 nunca passa este campo, e seu
  // comportamento continua idêntico ao de antes desta mudança.
  mostrarSelo?: boolean;
};

export type FontesAnuncio = {
  fotoUrl: string;
  logoUrl: string | null;
};

export type ResultadoRenderAnuncio =
  | { ok: true; bytes: Buffer }
  | { ok: false; erro: string };

// Barra inferior semitransparente + texto: a mesma técnica de "overlay
// sobre foto para legibilidade" já usada no Hero público (gradiente CSS),
// só que aqui precisa existir DENTRO do pixel exportado (SVG rasterizado
// pelo sharp), não como camada CSS — a imagem final é um arquivo único.
function montarSvgOverlay(formato: FormatoAnuncio, dados: DadosAnuncio): string {
  const { largura: w, altura: h } = formato;
  const padding = Math.round(w * 0.06);

  const fontePreco = Math.round(w * 0.05);
  const fonteCorpo = Math.round(w * 0.032);
  const fonteSelo = Math.round(w * 0.034);
  const gap = Math.round(fonteCorpo * 0.7);

  // Cursor vertical de cima pra baixo, cada elemento avança pela sua
  // PRÓPRIA altura (não uma fração arbitrária do painel) — a causa do bug
  // visto no smoke test (selo e preço sobrepostos) era medir o avanço como
  // percentual de alturaPainel em vez de como a altura real de cada
  // elemento anterior.
  let cursor = 0;
  const elementos: string[] = [];

  // MKT-002 — opcional: ausente (undefined) sempre se comporta como
  // true, então a MKT-001 (que nunca passa este campo) nunca muda de
  // aparência por causa desta extensão.
  const mostrarSelo = dados.mostrarSelo ?? true;
  if (mostrarSelo) {
    const alturaSelo = Math.round(fonteSelo * 1.9);
    elementos.push(
      `<rect x="${padding - Math.round(padding * 0.3)}" y="${cursor}" width="${Math.round(w * 0.42)}" height="${alturaSelo}" rx="${Math.round(fonteSelo)}" fill="#ffffff" />`,
      `<text x="${padding}" y="${cursor + Math.round(alturaSelo * 0.68)}" font-family="Arial, sans-serif" font-size="${fonteSelo}" font-weight="700" fill="#111111">${escaparSvg(dados.finalidadeLabel.toUpperCase())}</text>`
    );
    cursor += alturaSelo + gap * 1.5;
  }

  if (dados.precoFormatado) {
    cursor += fontePreco; // baseline fica no PÉ da linha, não no topo
    elementos.push(
      `<text x="${padding}" y="${Math.round(cursor)}" font-family="Arial, sans-serif" font-size="${fontePreco}" font-weight="700" fill="#ffffff">${escaparSvg(dados.precoFormatado)}</text>`
    );
    cursor += gap;
  }

  if (dados.localizacao) {
    cursor += fonteCorpo;
    elementos.push(
      `<text x="${padding}" y="${Math.round(cursor)}" font-family="Arial, sans-serif" font-size="${fonteCorpo}" fill="#f2f2f2">${escaparSvg(dados.localizacao)}</text>`
    );
    cursor += gap;
  }

  if (dados.itens.length > 0) {
    cursor += fonteCorpo;
    elementos.push(
      `<text x="${padding}" y="${Math.round(cursor)}" font-family="Arial, sans-serif" font-size="${fonteCorpo}" fill="#f2f2f2">${escaparSvg(dados.itens.join("  ·  "))}</text>`
    );
    cursor += gap;
  }

  // Altura total do bloco de texto, de baixo pra cima a partir da borda —
  // o painel (gradiente) precisa cobrir exatamente esse conteúdo mais uma
  // margem inferior pro rodapé, nunca um percentual fixo adivinhado.
  const alturaRodape = Math.round(fonteCorpo * 0.85 * 2.2);
  const alturaConteudo = Math.round(cursor) + alturaRodape;
  const margemInferior = Math.round(padding * 0.6);
  const alturaPainel = Math.min(h, alturaConteudo + margemInferior + padding);
  const topoPainel = h - alturaPainel;

  // Desloca todos os elementos já montados (que foram calculados a partir
  // de y=0) para dentro do painel.
  const deslocamento = topoPainel + padding;
  const elementosPosicionados = elementos.map((el) =>
    el.replace(/y="(-?[\d.]+)"/g, (_match, valor: string) => `y="${Number(valor) + deslocamento}"`)
  );

  const rodapeY = h - Math.round(padding * 0.5);
  const fonteRodape = Math.round(fonteCorpo * 0.85);
  const rodape: string[] = [
    `<text x="${padding}" y="${rodapeY}" font-family="Arial, sans-serif" font-size="${fonteRodape}" fill="#dddddd">${escaparSvg(dados.nomeOrganizacao)}</text>`,
  ];
  if (dados.whatsapp) {
    rodape.push(
      `<text x="${w - padding}" y="${rodapeY}" text-anchor="end" font-family="Arial, sans-serif" font-size="${fonteRodape}" fill="#dddddd">${escaparSvg(dados.whatsapp)}</text>`
    );
  }

  return `
<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000000" stop-opacity="0" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0.82" />
    </linearGradient>
  </defs>
  <rect x="0" y="${topoPainel}" width="${w}" height="${alturaPainel}" fill="url(#g)" />
  ${elementosPosicionados.join("\n  ")}
  ${rodape.join("\n  ")}
</svg>`;
}

export async function renderizarAnuncio(
  formato: FormatoAnuncio,
  dados: DadosAnuncio,
  fontes: FontesAnuncio
): Promise<ResultadoRenderAnuncio> {
  const bytesFoto = await buscarBytesSeguro(fontes.fotoUrl);
  if (!bytesFoto) return { ok: false, erro: "Não foi possível carregar a foto selecionada." };

  let fotoBase: sharp.Sharp;
  try {
    fotoBase = sharp(bytesFoto, { limitInputPixels: LIMITE_PIXELS_ENTRADA })
      .rotate()
      .resize({
        width: formato.largura,
        height: formato.altura,
        fit: "cover",
        position: "centre",
      });
  } catch {
    return { ok: false, erro: "Não foi possível processar a foto selecionada." };
  }

  const svgOverlay = Buffer.from(montarSvgOverlay(formato, dados));
  const composicoes: sharp.OverlayOptions[] = [{ input: svgOverlay, top: 0, left: 0 }];

  // Logo é best-effort: falha no download/decodificação nunca derruba o
  // criativo inteiro (seção 2 — ausência de logo é um layout válido sem
  // ele, não um erro).
  if (fontes.logoUrl) {
    const bytesLogo = await buscarBytesSeguro(fontes.logoUrl);
    if (bytesLogo) {
      try {
        const alturaLogo = Math.round(formato.largura * 0.09);
        const logoBuffer = await sharp(bytesLogo, { limitInputPixels: LIMITE_PIXELS_ENTRADA })
          .resize({ height: alturaLogo, withoutEnlargement: true })
          .png()
          .toBuffer();
        const margem = Math.round(formato.largura * 0.06);
        composicoes.push({ input: logoBuffer, top: margem, left: margem });
      } catch {
        // Logo ilegível: segue sem ele.
      }
    }
  }

  try {
    const bytes = await fotoBase.composite(composicoes).png().toBuffer();
    return { ok: true, bytes };
  } catch {
    return { ok: false, erro: "Não foi possível gerar a imagem do anúncio." };
  }
}
