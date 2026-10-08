// Render do criativo (MKT-001) — ÚNICO arquivo desta feature que faz I/O
// e usa `sharp`. Node-only, nunca importado de um Client Component (mesma
// regra de hero-image-processar.ts/extrair-paleta-logo.ts — sharp não
// roda no browser). Recebe só strings/números JÁ resolvidos pelo chamador
// (route.ts): este módulo não decide finalidade, não escolhe preço, não
// consulta banco — só desenha o que mandarem desenhar.
import sharp from "sharp";
import type { FormatoAnuncio } from "@/lib/anuncio-imovel";
import { formatarTelefoneExibicao } from "@/lib/telefone";

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

// Estimativa de largura de texto em Arial — sharp/resvg não expõe
// métricas reais de fonte pro Node (precisaria de um motor de layout de
// texto completo só pra isto), então o selo de finalidade usa uma
// largura FIXA estimada por caractere em vez da largura real. `fatorPeso`
// diferencia negrito (mais largo) de regular — calibrado visualmente
// contra o render real, não um valor de catálogo de fonte.
function estimarLarguraTexto(texto: string, fontSize: number, fatorPeso: number): number {
  return Math.round(texto.length * fontSize * fatorPeso);
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
  whatsapp: string | null; // já validado (temWhatsApp) por quem chama — único contato exibido no rodapé
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
    // 1.9 -> 1.45 e 0.85 -> 0.5: a primeira tentativa de hug ainda sobrava
    // respiro visível demais (feedback real sobre o render já com a
    // correção anterior) — valores recalibrados pra um selo/chip justo,
    // não mais um painel com texto dentro.
    const alturaSelo = Math.round(fonteSelo * 1.45);
    const textoSelo = dados.finalidadeLabel.toUpperCase();
    // Selo do tamanho do TEXTO (mais um respiro interno), não mais uma
    // fração fixa da largura do canvas — era o que deixava sobrando
    // espaço em branco num texto curto como "À VENDA" (achado real,
    // visível em "PARA ALUGAR" x"À VENDA" lado a lado).
    const seloPadX = Math.round(fonteSelo * 0.5);
    // 0.62 → 0.72: medido no screenshot real ("PARA ALUGAR" em Arial Bold
    // 700) — o fator anterior subestimava a largura real do texto, então
    // o selo ficava estreito demais e a própria palavra "ALUGAR" vazava
    // pra fora do chip branco (achado real: texto com borda preta visível
    // fora do selo, não um respiro sobrando como nas rodadas anteriores).
    const larguraSelo = estimarLarguraTexto(textoSelo, fonteSelo, 0.72) + seloPadX * 2;
    const seloX = padding - seloPadX;
    elementos.push(
      `<rect x="${seloX}" y="${cursor}" width="${larguraSelo}" height="${alturaSelo}" rx="${Math.round(alturaSelo / 2)}" fill="#ffffff" />`,
      // 0.75: baseline recalibrada pro novo alturaSelo mais baixo — centro
      // vertical de um texto caixa-alta (sem descendentes) fica mais perto
      // do pé do selo que do topo, porque a altura visível da letra
      // (cap-height) é menor que a altura da fonte usada pro cálculo.
      `<text x="${padding}" y="${cursor + Math.round(alturaSelo * 0.75)}" font-family="Arial, sans-serif" font-size="${fonteSelo}" font-weight="700" fill="#111111">${escaparSvg(textoSelo)}</text>`
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

  // Achado real (feedback do usuário sobre o criativo): o rodapé não
  // precisa repetir o nome da organização/corretor — só o canal de
  // contato importa no material final. O WhatsApp ganha o ícone da
  // marca (mesmo glifo de IconeWhatsApp em src/components/icons.tsx,
  // desenhado aqui como path cru porque o overlay inteiro é SVG
  // montado à mão, não JSX) e a máscara visual de sempre
  // ((00) 00000-0000) em vez do número cru.
  const rodapeY = h - Math.round(padding * 0.5);
  const fonteRodape = Math.round(fonteCorpo * 0.85);
  const rodape: string[] = [];
  if (dados.whatsapp) {
    const telefoneExibicao = formatarTelefoneExibicao(dados.whatsapp);
    const iconeTamanho = Math.round(fonteRodape * 1.1);
    const gapIconeTexto = Math.round(fonteRodape * 0.4);
    // "(00) 00000-0000" tem comprimento fixo — a mesma estimativa de
    // largura do selo, só que calibrada pra texto regular (não negrito).
    const larguraTexto = estimarLarguraTexto(telefoneExibicao, fonteRodape, 0.56);
    const textoX = w - padding;
    const iconeX = textoX - larguraTexto - gapIconeTexto - iconeTamanho;
    const iconeY = rodapeY - iconeTamanho + Math.round(iconeTamanho * 0.12);
    const escalaIcone = iconeTamanho / 24; // viewBox do glifo é 24x24
    rodape.push(
      `<g transform="translate(${iconeX}, ${iconeY}) scale(${escalaIcone})" fill="#25D366"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.03c-.24.68-1.4 1.3-1.93 1.38-.49.08-1.1.11-1.78-.11-.41-.13-.93-.3-1.6-.59-2.83-1.22-4.68-4.06-4.82-4.25-.14-.19-1.15-1.53-1.15-2.92s.72-2.07.98-2.35c.24-.27.53-.34.71-.34.18 0 .36 0 .51.01.17.01.39-.06.6.47.24.6.83 2.06.9 2.21.07.15.11.32.02.51-.09.19-.14.31-.27.48-.14.17-.29.37-.41.5-.14.14-.28.29-.12.57.16.28.72 1.2 1.55 1.94 1.07.95 1.96 1.25 2.24 1.39.28.14.44.12.61-.07.17-.2.71-.83.9-1.11.19-.28.37-.23.62-.14.25.09 1.6.76 1.87.9.27.14.45.2.52.32.07.11.07.65-.17 1.32Z" /></g>`,
      `<text x="${textoX}" y="${rodapeY}" text-anchor="end" font-family="Arial, sans-serif" font-size="${fonteRodape}" fill="#dddddd">${escaparSvg(telefoneExibicao)}</text>`
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
        // 0.09 → 0.12 → 0.17 → 0.24 → 0.168: a rodada 0.24 (calibrada por
        // medição direta no screenshot real) passou do tamanho desejado —
        // feedback real pedindo -30%, aplicado sobre 0.24 (0.24*0.7).
        //
        // withoutEnlargement removido: ele limitava o logo à resolução
        // nativa do arquivo enviado pela organização — se esse arquivo for
        // pequeno, aumentar este fator não tinha efeito nenhum acima desse
        // teto, o que explicaria por que os aumentos anteriores (0.12,
        // 0.17) continuaram "pouco". Pra um material de marketing, upscale
        // com leve perda de nitidez é preferível a ignorar silenciosamente
        // o tamanho pedido.
        const alturaLogo = Math.round(formato.largura * 0.168);
        const logoBuffer = await sharp(bytesLogo, { limitInputPixels: LIMITE_PIXELS_ENTRADA })
          .resize({ height: alturaLogo })
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
