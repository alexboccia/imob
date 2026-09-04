"use client";

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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
}: {
  fotoInicial: string | null;
  name?: string;
  label?: string;
  descricao?: string;
  alt?: string;
}) {
  const [foto, setFoto] = useState(fotoInicial);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleArquivo(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    if (!arquivo) return;

    setEnviando(true);
    setErro(null);
    const formData = new FormData();
    formData.append("arquivo", arquivo);
    formData.append("pasta", "usuarios");
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
      <Label>{label}</Label>
      {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
      <input type="hidden" name={name} value={foto ?? ""} />
      <div className="flex items-center gap-4">
        <div className="relative w-16 h-16 rounded-full overflow-hidden border bg-gray-100 shrink-0">
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
        <div className="space-y-1">
          <input
            type="file"
            accept="image/*"
            onChange={handleArquivo}
            disabled={enviando}
            className="block text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white file:cursor-pointer hover:file:bg-gray-800 active:file:bg-gray-900 file:transition-colors disabled:opacity-50"
          />
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
