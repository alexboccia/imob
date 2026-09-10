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
  // 20 MB, o valor que já estava reservado aqui: cabe folgado um book de
  // empreendimento com plantas em alta resolução, e continua sendo um
  // teto que o R2 aguenta sem drama. Vale para os materiais de
  // apresentação (única categoria de documento existente hoje).
  documento: 20 * 1024 * 1024,
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

// %PDF- nos primeiros bytes. Vale para todas as versões do formato.
function assinaturaPdf(b: Uint8Array): boolean {
  const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
  return b.length >= PDF.length && PDF.every((byte, i) => b[i] === byte);
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
// MediaUploader/LogoUpload/FotoCorretorUpload — todos só aceitam imagem —
// e MateriaisUploader, que aceita PDF). SVG, HTML, JS, executáveis,
// compactados etc. nunca precisam de checagem explícita de bloqueio — por
// não estarem na lista, já são recusados.
//
// `application/pdf` entrou quando os materiais de apresentação passaram a
// existir de verdade — exatamente a condição que este comentário exigia.
// Vídeo (`video/mp4`, `video/webm`) continua fora: vídeo no produto é
// link de embed, não upload.
export const TIPOS_PERMITIDOS: Record<string, TipoPermitido> = {
  "image/jpeg": { categoria: "imagem", extensoes: ["jpg", "jpeg"], assinatura: assinaturaJpeg },
  "image/png": { categoria: "imagem", extensoes: ["png"], assinatura: assinaturaPng },
  "image/webp": { categoria: "imagem", extensoes: ["webp"], assinatura: assinaturaWebp },
  "application/pdf": { categoria: "documento", extensoes: ["pdf"], assinatura: assinaturaPdf },
};

// Pastas de destino válidas no bucket e quais categorias de arquivo cada
// uma aceita. Qualquer "pasta" fora desta lista é recusada — nunca é
// concatenada crua na chave do objeto.
export const PASTAS_PERMITIDAS: Record<string, { categorias: readonly Categoria[] }> = {
  imoveis: { categorias: ["imagem"] },
  usuarios: { categorias: ["imagem"] },
  site: { categorias: ["imagem"] },
  // Imagem do Hero da Home pública — mesma categoria "imagem" de sempre
  // (mesmo teto de tamanho), só que o conteúdo é sempre reprocessado
  // (nunca guardado como veio) antes de ir pro R2, ver
  // hero-image-processar.ts (chamado só pela rota de upload quando
  // pasta === "hero").
  hero: { categorias: ["imagem"] },
  // Materiais de apresentação do imóvel (book, plantas, tabela de
  // preços). SÓ documento: uma imagem enviada aqui seria recusada, do
  // mesmo jeito que um PDF é recusado em "imoveis".
  materiais: { categorias: ["documento"] },
  // Foto do próprio perfil público, enviada pela tela de
  // autoatendimento. Pasta separada de "usuarios" de propósito: aquela
  // é restrita à gestão de usuários, e reaproveitá-la aqui alargaria uma
  // permissão administrativa para conseguir uma foto. A chave continua
  // sendo {organizationId}/perfil/{uuid} — o prefixo vem da sessão, não
  // do cliente, então não há como escrever no espaço de outro tenant.
  perfil: { categorias: ["imagem"] },
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
