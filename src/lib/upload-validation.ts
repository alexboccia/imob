// Validação centralizada de upload de mídia (Cloudflare R2). Tudo que
// define "o que pode ser enviado" mora aqui — a rota de upload só orquestra
// autenticação/autorização e a chamada ao R2, nunca decide sozinha o que é
// um arquivo válido.

// Limites de tamanho por categoria de arquivo, em bytes. Valores
// conservadores de propósito — é mais fácil relaxar um limite depois do que
// lidar com abuso de armazenamento/egress. `documento` e `video` ficam
// definidos aqui (documentando a decisão) mas SEM nenhum tipo habilitado em
// `TIPOS_PERMITIDOS` — não existe fluxo de documento nem de upload de vídeo
// implementado no produto hoje (vídeo é só link de embed, ver
// MediaUploader.tsx), então não há o que aceitar ainda.
export const LIMITE_TAMANHO_BYTES = {
  imagem: 10 * 1024 * 1024, // 10 MB
  documento: 20 * 1024 * 1024, // 20 MB — reservado, nenhum tipo habilitado
  video: 100 * 1024 * 1024, // reservado, nenhum tipo habilitado
} as const;

type Categoria = keyof typeof LIMITE_TAMANHO_BYTES;

type AssinaturaArquivo = (cabecalho: Uint8Array) => boolean;

type TipoPermitido = {
  categoria: Categoria;
  /** Extensões aceitas para esse MIME (minúsculas, sem ponto). */
  extensoes: readonly string[];
  /** Checagem de magic bytes — obrigatória, nunca aceitamos "no escuro". */
  assinatura: AssinaturaArquivo;
};

function assinaturaJpeg(b: Uint8Array): boolean {
  return b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

function assinaturaPng(b: Uint8Array): boolean {
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return b.length >= PNG.length && PNG.every((byte, i) => b[i] === byte);
}

function assinaturaWebp(b: Uint8Array): boolean {
  // RIFF <4 bytes de tamanho> WEBP
  return (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  );
}

// Allowlist estrita: só entra aqui o que o produto realmente usa hoje (ver
// MediaUploader/LogoUpload/FotoCorretorUpload — todos só aceitam imagem).
// SVG, HTML, JS, executáveis, compactados etc. nunca precisam de checagem
// explícita de bloqueio — por não estarem na lista, já são recusados.
// PDF e vídeo (`application/pdf`, `video/mp4`, `video/webm`) ficam de fora
// de propósito: habilitar só quando existir um fluxo de verdade no produto
// que os use (mesmo raciocínio do limite de tamanho acima).
export const TIPOS_PERMITIDOS: Record<string, TipoPermitido> = {
  "image/jpeg": { categoria: "imagem", extensoes: ["jpg", "jpeg"], assinatura: assinaturaJpeg },
  "image/png": { categoria: "imagem", extensoes: ["png"], assinatura: assinaturaPng },
  "image/webp": { categoria: "imagem", extensoes: ["webp"], assinatura: assinaturaWebp },
};

// Pastas de destino válidas no bucket e quais categorias de arquivo cada
// uma aceita. Qualquer "pasta" fora desta lista é recusada — nunca é
// concatenada crua na chave do objeto.
export const PASTAS_PERMITIDAS: Record<string, { categorias: readonly Categoria[] }> = {
  imoveis: { categorias: ["imagem"] },
  usuarios: { categorias: ["imagem"] },
  site: { categorias: ["imagem"] },
};

export function extrairExtensao(nomeArquivo: string): string | null {
  const partes = nomeArquivo.toLowerCase().split(".");
  if (partes.length < 2) return null;
  const ultima = partes[partes.length - 1].replace(/[^a-z0-9]/g, "");
  return ultima || null;
}

// Só para trilha de auditoria (ActivityLog) — nunca usado para montar a
// chave do objeto no R2, que é sempre {organizationId}/{pasta}/{uuid}.{ext}
// com uuid gerado no servidor e extensão derivada do MIME validado.
export function sanitizarNomeLogico(nomeArquivo: string): string {
  return nomeArquivo
    .normalize("NFKD")
    .replace(/[^\w.\- ]/g, "")
    .slice(0, 120);
}

export type ResultadoValidacao =
  | { ok: true; extensao: string; mime: string }
  | { ok: false; erro: string; status: number };

export async function validarArquivo(
  arquivo: File,
  pasta: string
): Promise<ResultadoValidacao> {
  const configPasta = PASTAS_PERMITIDAS[pasta];
  if (!configPasta) {
    return { ok: false, erro: "Pasta de destino inválida.", status: 400 };
  }

  if (arquivo.size === 0) {
    return { ok: false, erro: "Arquivo vazio.", status: 400 };
  }

  const tipo = TIPOS_PERMITIDOS[arquivo.type];
  if (!tipo || !configPasta.categorias.includes(tipo.categoria)) {
    return { ok: false, erro: "Tipo de arquivo não permitido.", status: 400 };
  }

  const extensaoDeclarada = extrairExtensao(arquivo.name);
  if (!extensaoDeclarada || !tipo.extensoes.includes(extensaoDeclarada)) {
    return {
      ok: false,
      erro: "A extensão do arquivo não corresponde ao tipo enviado.",
      status: 400,
    };
  }

  const limite = LIMITE_TAMANHO_BYTES[tipo.categoria];
  if (arquivo.size > limite) {
    return {
      ok: false,
      erro: `Arquivo muito grande. Limite de ${Math.floor(limite / (1024 * 1024))}MB para este tipo.`,
      status: 413,
    };
  }

  const cabecalho = new Uint8Array(await arquivo.slice(0, 16).arrayBuffer());
  if (!tipo.assinatura(cabecalho)) {
    return {
      ok: false,
      erro: "O conteúdo do arquivo não corresponde ao tipo declarado.",
      status: 400,
    };
  }

  return { ok: true, extensao: tipo.extensoes[0], mime: arquivo.type };
}

// Decisão explícita de "esse imóvel é desta organização", separada da
// consulta ao banco — mantém a regra pura e testável sem precisar de um
// Prisma real no teste.
export function imovelValidoParaOrganizacao(
  imovel: { organizationId: string } | null,
  organizationId: string
): boolean {
  return imovel !== null && imovel.organizationId === organizationId;
}
