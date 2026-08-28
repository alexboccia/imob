import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getR2Client } from "@/lib/r2";
import { requireOrganizationId } from "@/lib/tenant";
import { logActivity } from "@/lib/activity-log";
import { temPapel, PAPEIS_GESTAO_USUARIOS, PAPEIS_GESTAO_CONFIGURACOES } from "@/lib/authorization";
import {
  validarArquivo,
  sanitizarNomeLogico,
  imovelValidoParaOrganizacao,
  PASTAS_PERMITIDAS,
} from "@/lib/upload-validation";
import { processarImagemHero } from "@/lib/hero-image-processar";
import { obterKvStore } from "@/lib/kv-store";
import { verificarLimiteUpload } from "@/lib/rate-limit";
import { cabecalhosLimiteExcedido } from "@/lib/rate-limit-response";
import { registrarAbuso } from "@/lib/abuse-log";
import { logger } from "@/lib/logger";

// Quem pode enviar arquivo pra cada pasta. `null` = qualquer membro ativo
// da organização (mesmo nível de acesso já usado pra criar/editar imóvel,
// que não é restrito por papel). "usuarios" e "site" seguem exatamente a
// mesma regra das actions que de fato usam esses uploads (editar usuário e
// salvar configurações da organização) — sem isso, um papel sem permissão
// pra salvar o formulário ainda conseguiria gastar armazenamento chamando
// o endpoint direto.
const PAPEIS_POR_PASTA: Record<string, ReadonlySet<string> | null> = {
  imoveis: null,
  usuarios: PAPEIS_GESTAO_USUARIOS,
  site: PAPEIS_GESTAO_CONFIGURACOES,
  hero: PAPEIS_GESTAO_CONFIGURACOES,
};

function erro(mensagem: string, status: number) {
  return NextResponse.json({ erro: mensagem }, { status });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.organizationId || !session.user.organizationMemberId) {
    return erro("Não autorizado.", 401);
  }
  const organizationId = await requireOrganizationId();

  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!bucket || !publicUrl) {
    logger.error("R2_BUCKET_NAME/R2_PUBLIC_URL não configurados", undefined, {
      organizationId,
      route: "/api/admin/upload",
      modulo: "upload",
    });
    return erro("Storage de mídia indisponível no momento.", 500);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return erro("Requisição inválida.", 400);
  }

  // A pasta de destino é sempre um valor de uma allowlist fixa — nunca é
  // concatenada crua na chave do objeto, então não há como manipular o
  // prefixo com barras/pontos/encoding por aqui.
  const pastaSolicitada = formData.get("pasta");
  const pasta = typeof pastaSolicitada === "string" ? pastaSolicitada : "";
  if (!Object.prototype.hasOwnProperty.call(PASTAS_PERMITIDAS, pasta)) {
    return erro("Pasta de destino inválida.", 400);
  }

  const papeisPermitidos = PAPEIS_POR_PASTA[pasta];
  if (papeisPermitidos && !temPapel(session.user.role, papeisPermitidos)) {
    return erro("Você não tem permissão para enviar arquivos aqui.", 403);
  }

  // Limite de uploads por janela de tempo (por usuário e por organização)
  // — independente do limite total de mídia do plano (entitlements.ts),
  // que continua valendo à parte. Isso aqui é só "não mais que N envios
  // em X minutos", pra conter abuso/loop de upload, não o tamanho do
  // catálogo de mídia da organização.
  const kvStore = obterKvStore();
  if (kvStore) {
    const limiteUpload = await verificarLimiteUpload(kvStore, {
      organizationMemberId: session.user.organizationMemberId,
      organizationId,
    });
    if (!limiteUpload.permitido) {
      registrarAbuso({
        tipo: "upload",
        motivo: `rate_limit_${limiteUpload.motivo}`,
        organizationId,
      });
      return NextResponse.json(
        { erro: "Muitos envios em pouco tempo. Aguarde um instante e tente novamente." },
        { status: 429, headers: cabecalhosLimiteExcedido(limiteUpload.retryAfterSegundos) }
      );
    }
  }

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    return erro("Arquivo ausente.", 400);
  }

  // Opcional: quando o upload é feito editando um imóvel específico, o
  // cliente pode informar o id. Se vier, tem que ser um imóvel desta
  // organização — nunca confiamos nele sem checar.
  const propertyIdBruto = formData.get("propertyId");
  const propertyId =
    typeof propertyIdBruto === "string" && propertyIdBruto.trim() ? propertyIdBruto : null;
  if (propertyId) {
    const imovel = await prisma.property.findFirst({
      where: { id: propertyId, organizationId },
      select: { organizationId: true },
    });
    if (!imovelValidoParaOrganizacao(imovel, organizationId)) {
      return erro("Imóvel informado não pertence a esta organização.", 403);
    }
  }

  const validacao = await validarArquivo(arquivo, pasta);
  if (!validacao.ok) {
    return erro(validacao.erro, validacao.status);
  }

  let bytes: Buffer = Buffer.from(await arquivo.arrayBuffer());
  let extensao = validacao.extensao;
  let mime = validacao.mime;

  // Hero da Home: reprocessa sempre (nunca guarda o arquivo como veio) —
  // corrige orientação EXIF, valida dimensões mínimas e recodifica pra
  // WebP. Ver hero-image-processar.ts — único ponto que decodifica isto
  // com sharp.
  if (pasta === "hero") {
    const processado = await processarImagemHero(bytes);
    if (!processado.ok) {
      return erro(processado.erro, processado.status);
    }
    bytes = processado.bytes;
    extensao = "webp";
    mime = "image/webp";
  }

  // organizationId sempre vem da sessão (requireOrganizationId), nunca do
  // cliente; uuid gerado no servidor; extensão derivada do MIME já
  // validado (ou, pro Hero, do formato final após reprocessamento) — o
  // nome original do arquivo nunca entra na chave.
  const chave = `${organizationId}/${pasta}/${crypto.randomUUID()}.${extensao}`;
  const nomeOriginalSanitizado = sanitizarNomeLogico(arquivo.name);

  try {
    const client = getR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: chave,
        Body: bytes,
        ContentType: mime,
      })
    );
  } catch (erroEnvio) {
    logger.error("Falha ao enviar arquivo para o R2", erroEnvio, {
      organizationId,
      userId: session.user.id,
      route: "/api/admin/upload",
      modulo: "upload",
    });
    await logActivity({
      organizationId,
      userId: session.user.id,
      entity: "Media",
      action: "error",
      payload: { pasta, nomeOriginal: nomeOriginalSanitizado },
    });
    return erro("Falha ao enviar o arquivo. Tente novamente.", 500);
  }

  await logActivity({
    organizationId,
    userId: session.user.id,
    entity: "Media",
    action: "upload",
    payload: {
      pasta,
      chave,
      nomeOriginal: nomeOriginalSanitizado,
      propertyId: propertyId ?? null,
    },
  });

  return NextResponse.json({ url: `${publicUrl}/${chave}` });
}
