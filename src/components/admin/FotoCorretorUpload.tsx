"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LIMITE_TAMANHO_BYTES, TIPOS_PERMITIDOS } from "@/lib/upload-validation";

// Formatos/limite exibidos na variante "grande" — derivados da MESMA
// allowlist que a rota /api/admin/upload valida (upload-validation.ts),
// nunca digitados a dedo: o texto nunca diverge do que o servidor aceita
// de fato (achado real — a referência visual desta fase mostrava "máx.
// 5 MB" e "mínimo 400×400px", nenhum dos dois é verdade hoje).
const FORMATOS_IMAGEM = Object.values(TIPOS_PERMITIDOS)
  .filter((t) => t.categoria === "imagem")
  .flatMap((t) => t.extensoes.map((e) => e.toUpperCase()))
  .filter((v, i, arr) => arr.indexOf(v) === i)
  .join(", ");
const LIMITE_MB_IMAGEM = Math.floor(LIMITE_TAMANHO_BYTES.imagem / (1024 * 1024));

// Upload de foto de usuário. Parametrizado por `name`/`label` porque o
// mesmo controle serve a DUAS fotos com significados diferentes: a foto
// interna do painel (User.avatarUrl) e a foto comercial pública do
// profissional (OrganizationMember.publicPhotoUrl). São campos distintos
// de propósito — a foto do painel nunca vira foto de site sozinha —, mas
// o mecanismo de envio é o mesmo endpoint validado (/api/admin/upload,
// pasta "usuarios", restrita aos papéis de gestão de usuários), sem um
// segundo caminho de armazenamento.
export function FotoCorretorUpload({
  fotoInicial,
  name = "foto",
  label = "Foto",
  descricao,
  alt = "Foto do usuário",
  // Pasta de destino no storage. "usuarios" é a da gestão de usuários
  // (restrita por papel); a tela de autoatendimento passa "perfil", que
  // qualquer membro ativo pode usar para a própria foto.
  pasta = "usuarios",
  // Fase 130 — variante visual só pro card "Foto pública" (Meu perfil
  // público): moldura maior (128px) e com cantos arredondados, igual à
  // referência aprovada, em vez do avatar circular de 64px que a gestão
  // de usuários continua usando. Mecânica de upload idêntica nos dois
  // casos — nenhum segundo caminho de armazenamento, só o CSS muda.
  variante = "compacta",
}: {
  fotoInicial: string | null;
  name?: string;
  label?: string;
  descricao?: string;
  alt?: string;
  pasta?: "usuarios" | "perfil";
  variante?: "compacta" | "grande";
}) {
  const [foto, setFoto] = useState(fotoInicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const grande = variante === "grande";
  // Fase 74 — id derivado de `name` (único por instância; a mesma tela de
  // edição de usuário renderiza DOIS uploads ao mesmo tempo: "foto" e
  // "perfilPublicoFoto"). Antes, <Label> não tinha htmlFor nenhum — o
  // <input type="file"> ficava sem nome acessível associado de verdade,
  // só o texto solto ao lado.
  const idInput = `foto-upload-${name}`;

  async function handleArquivo(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    setEnviando(true);
    setErro(null);
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    formData.append("pasta", pasta);
    const resposta = await fetch("/api/admin/upload", {
      method: "POST",
      body: formData,
    });
    const dados = await resposta.json();
    setEnviando(false);
    if (!resposta.ok) {
      setErro(dados.erro ?? "Falha ao enviar arquivo");
      return;
    }
    setFoto(dados.url);
    event.target.value = "";
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={idInput}>{label}</Label>
      {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
      <input type="hidden" name={name} value={foto ?? ""} />
      {/* flex-wrap + min-w-0: em container estreito (a tela de
          autoatendimento em 390px, por exemplo) a miniatura e os
          controles não cabem lado a lado, e sem quebra a linha empurrava
          a largura do formulário inteiro. */}
      <div className="flex flex-wrap items-center gap-4">
        <div
          className={cn(
            "relative shrink-0 overflow-hidden border bg-gray-100",
            grande ? "size-32 rounded-2xl" : "size-16 rounded-full"
          )}
        >
          {foto ? (
            <Image
              src={foto}
              alt={alt}
              fill
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
              Sem foto
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <input
            id={idInput}
            type="file"
            accept="image/*"
            onChange={handleArquivo}
            disabled={enviando}
            // w-full min-w-0 max-w-full: a largura intrínseca do
            // <input type="file"> (botão + nome do arquivo) é maior que
            // 288px e estourava a coluna em 320px. Mesmas classes que os
            // uploads de logo e favicon já usam.
            className="block w-full min-w-0 max-w-full text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white file:cursor-pointer hover:file:bg-gray-800 active:file:bg-gray-900 file:transition-colors disabled:opacity-50"
          />
          {grande && (
            <p className="text-xs text-muted-foreground">
              Formatos aceitos: {FORMATOS_IMAGEM} (máx. {LIMITE_MB_IMAGEM}MB).
            </p>
          )}
          {foto && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="text-destructive h-auto p-0 block"
              onClick={() => setFoto(null)}
            >
              Remover foto
            </Button>
          )}
          {erro && <p className="text-xs text-destructive">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
