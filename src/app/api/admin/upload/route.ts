import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { auth } from "@/lib/auth";
import { getR2Client } from "@/lib/r2";

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const bucket = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!bucket || !publicUrl) {
    return NextResponse.json(
      {
        erro:
          "Storage de mídia não configurado. Defina R2_BUCKET_NAME e R2_PUBLIC_URL no .env.",
      },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File)) {
    return NextResponse.json({ erro: "Arquivo ausente" }, { status: 400 });
  }

  const pastasPermitidas = ["imoveis", "usuarios", "site"];
  const pastaSolicitada = formData.get("pasta");
  const pasta =
    typeof pastaSolicitada === "string" && pastasPermitidas.includes(pastaSolicitada)
      ? pastaSolicitada
      : "imoveis";

  const extensao = arquivo.name.split(".").pop() ?? "bin";
  const chave = `${pasta}/${crypto.randomUUID()}.${extensao}`;
  const bytes = Buffer.from(await arquivo.arrayBuffer());

  try {
    const client = getR2Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: chave,
        Body: bytes,
        ContentType: arquivo.type || "application/octet-stream",
      })
    );
  } catch (erro) {
    return NextResponse.json(
      { erro: erro instanceof Error ? erro.message : "Falha no upload" },
      { status: 500 }
    );
  }

  return NextResponse.json({ url: `${publicUrl}/${chave}` });
}
