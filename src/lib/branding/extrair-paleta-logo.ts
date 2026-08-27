import sharp from "sharp";
import { extrairCorMarca, type MotivoFalhaPaleta } from "@/lib/branding/gerar-paleta";
import type { TokensTema } from "@/lib/branding/temas";
import type { Oklch } from "@/lib/branding/oklch-color";

// Único ponto do sistema que faz I/O pra gerar a paleta automática — busca
// os bytes do logotipo e decodifica com `sharp` (já é dependência direta
// do Next.js nesta versão, usado pelo próprio otimizador de imagem embutido;
// ver package.json — nenhuma dependência nova "pesada" foi introduzida só
// por esta feature). A extração de cor em si (extrairCorMarca) é pura e
// mora em gerar-paleta.ts, sem I/O — só este arquivo lida com fetch/sharp,
// o que é o que os testes de unidade mockam (vi.mock deste módulo) pra
// testar as Server Actions sem rede/imagem real.
//
// A URL recebida aqui SEMPRE já foi validada por validarUrlMidiaOrganizacao
// (favicon-url.ts) no chamador — nunca aceitar uma URL não validada, ou
// isto vira um SSRF: o servidor buscaria qualquer URL que o client pedisse.

const TAMANHO_MAX_BYTES = 10 * 1024 * 1024; // mesmo teto de LIMITE_TAMANHO_BYTES.imagem (upload-validation.ts)
const TIMEOUT_MS = 8_000;
const LADO_MINIATURA = 48; // suficiente pra um histograma de cor, decodificação quase instantânea

export type MotivoFalhaExtracao = MotivoFalhaPaleta | "falha_download" | "arquivo_grande_demais" | "falha_processamento";

export type ResultadoExtracaoLogo =
  | { ok: true; tokens: TokensTema; corMarca: Oklch }
  | { ok: false; motivo: MotivoFalhaExtracao };

export async function gerarPaletaDoLogo(logoUrl: string): Promise<ResultadoExtracaoLogo> {
  let bytes: Buffer;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let resposta: Response;
    try {
      resposta = await fetch(logoUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
    if (!resposta.ok) return { ok: false, motivo: "falha_download" };

    const contentLength = resposta.headers.get("content-length");
    if (contentLength && Number(contentLength) > TAMANHO_MAX_BYTES) {
      return { ok: false, motivo: "arquivo_grande_demais" };
    }

    const arrayBuffer = await resposta.arrayBuffer();
    if (arrayBuffer.byteLength > TAMANHO_MAX_BYTES) {
      return { ok: false, motivo: "arquivo_grande_demais" };
    }
    bytes = Buffer.from(arrayBuffer);
  } catch {
    return { ok: false, motivo: "falha_download" };
  }

  try {
    // Miniatura pequena antes de analisar: rápido, determinístico, e
    // dilui pixels isolados de antialiasing/ruído (que só sobrevivem em
    // baixíssima proporção depois do resize) sem precisar de nenhuma
    // lógica de "detecção de ruído" separada.
    const { data, info } = await sharp(bytes, { limitInputPixels: 64_000_000 })
      .resize(LADO_MINIATURA, LADO_MINIATURA, { fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.channels !== 4) return { ok: false, motivo: "falha_processamento" };
    return extrairCorMarca(data);
  } catch {
    return { ok: false, motivo: "falha_processamento" };
  }
}
