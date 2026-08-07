"use server";

import { ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getR2Client } from "@/lib/r2";
import { requireOrganizationId } from "@/lib/tenant";
import { withOrganization } from "@/lib/tenant-context";

const IDADE_MINIMA_MS = 24 * 60 * 60 * 1000;

export async function limparMidiasOrfas() {
  const session = await auth();
  if (
    !session ||
    (session.user.role !== "OWNER" && session.user.role !== "ADMIN" && session.user.role !== "MANAGER")
  ) {
    throw new Error(
      "Apenas administradores ou gestores podem executar essa limpeza."
    );
  }

  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!bucket || !publicUrl) {
    throw new Error("Storage de mídia não configurado.");
  }

  const client = getR2Client();

  const organizationId = await requireOrganizationId();
  const midias = await withOrganization(organizationId, () =>
    prisma.media.findMany({ where: { organizationId }, select: { url: true } })
  );
  const chavesEmUso = new Set(
    midias
      .filter((m) => m.url.startsWith(publicUrl))
      .map((m) => m.url.slice(publicUrl.length + 1))
  );

  const agora = Date.now();
  const chavesParaRemover: string[] = [];
  let continuationToken: string | undefined;
  let totalObjetos = 0;

  do {
    const resposta = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: "imoveis/",
        ContinuationToken: continuationToken,
      })
    );

    for (const objeto of resposta.Contents ?? []) {
      if (!objeto.Key) continue;
      totalObjetos += 1;
      const idadeMs = objeto.LastModified
        ? agora - objeto.LastModified.getTime()
        : Infinity;
      if (!chavesEmUso.has(objeto.Key) && idadeMs > IDADE_MINIMA_MS) {
        chavesParaRemover.push(objeto.Key);
      }
    }

    continuationToken = resposta.IsTruncated
      ? resposta.NextContinuationToken
      : undefined;
  } while (continuationToken);

  let totalRemovidas = 0;
  for (let i = 0; i < chavesParaRemover.length; i += 1000) {
    const lote = chavesParaRemover.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: lote.map((Key) => ({ Key })) },
      })
    );
    totalRemovidas += lote.length;
  }

  return { totalObjetos, totalRemovidas };
}
