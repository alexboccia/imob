"use client";

import { useState } from "react";
import { IconeFechar } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_MATERIAIS_POR_IMOVEL } from "@/lib/materiais-imovel";

// Materiais de apresentação do imóvel: book, plantas, tabela de preços.
//
// Mesmo contrato do MediaUploader: o arquivo sobe na hora para o R2 (via
// /api/admin/upload, que valida papel, tamanho, MIME e magic bytes) e o
// que fica no formulário é só a URL devolvida pelo servidor, num campo
// escondido em JSON. Salvar o imóvel é o que persiste a lista.
//
// Ordenação por botões, não por arrastar: a lista tem no máximo dez
// itens e "subir/descer" funciona no teclado e no toque sem nenhuma
// biblioteca — arrastar seria mais bonito e menos acessível.

export type MaterialItem = {
  name: string;
  url: string;
  active: boolean;
};

export function MateriaisUploader({
  materiaisIniciais = [],
  propertyId,
}: {
  materiaisIniciais?: MaterialItem[];
  /** Id do imóvel sendo editado, se já existir (imóvel novo ainda não tem id). */
  propertyId?: string;
}) {
  const [materiais, setMateriais] = useState<MaterialItem[]>(materiaisIniciais);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // "Book do empreendimento.pdf" -> "Book do empreendimento". O corretor
  // pode renomear depois; isto é só um começo melhor que vazio.
  function nomeInicial(nomeArquivo: string): string {
    return nomeArquivo.replace(/\.[^.]+$/, "").trim() || "Material de apresentação";
  }

  async function handleArquivos(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = event.target.files;
    if (!arquivos || arquivos.length === 0) return;

    setEnviando(true);
    setErro(null);

    const novos: MaterialItem[] = [];
    for (const arquivo of Array.from(arquivos)) {
      if (materiais.length + novos.length >= MAX_MATERIAIS_POR_IMOVEL) {
        setErro(`Máximo de ${MAX_MATERIAIS_POR_IMOVEL} materiais por imóvel.`);
        break;
      }
      const formData = new FormData();
      formData.append("arquivo", arquivo);
      formData.append("pasta", "materiais");
      if (propertyId) formData.append("propertyId", propertyId);
      const resposta = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErro(dados.erro ?? "Falha ao enviar arquivo");
        continue;
      }
      novos.push({ name: nomeInicial(arquivo.name), url: dados.url, active: true });
    }

    setMateriais((atual) => [...atual, ...novos]);
    setEnviando(false);
    event.target.value = "";
  }

  function alterar(indice: number, mudanca: Partial<MaterialItem>) {
    setMateriais((atual) =>
      atual.map((m, i) => (i === indice ? { ...m, ...mudanca } : m))
    );
  }

  function remover(indice: number) {
    setMateriais((atual) => atual.filter((_, i) => i !== indice));
  }

  function mover(indice: number, direcao: -1 | 1) {
    setMateriais((atual) => {
      const destino = indice + direcao;
      if (destino < 0 || destino >= atual.length) return atual;
      const copia = [...atual];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  return (
    <div className="space-y-3">
      <input
        type="hidden"
        name="materiaisJson"
        value={JSON.stringify(materiais)}
      />

      <div>
        <h3 className="text-sm font-medium">Materiais de apresentação</h3>
        <p className="text-xs text-muted-foreground">
          PDF, até 20MB por arquivo. Ficam disponíveis no site depois que o
          visitante informa o contato — quem não deixa contato não recebe o
          arquivo.
        </p>
      </div>

      {materiais.length > 0 && (
        <ul className="space-y-2">
          {materiais.map((material, indice) => (
            <li
              key={material.url}
              className="flex flex-wrap items-center gap-2 rounded-md border p-2"
              data-material-item
            >
              <Input
                aria-label={`Nome do material ${indice + 1}`}
                value={material.name}
                onChange={(e) => alterar(indice, { name: e.target.value })}
                className="min-w-40 flex-1"
              />
              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={material.active}
                  onChange={(e) => alterar(indice, { active: e.target.checked })}
                />
                Ativo
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Subir ${material.name}`}
                disabled={indice === 0}
                onClick={() => mover(indice, -1)}
              >
                ↑
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Descer ${material.name}`}
                disabled={indice === materiais.length - 1}
                onClick={() => mover(indice, 1)}
              >
                ↓
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Remover ${material.name}`}
                onClick={() => remover(indice)}
              >
                <IconeFechar className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Input
          type="file"
          accept="application/pdf"
          multiple
          onChange={handleArquivos}
          disabled={enviando || materiais.length >= MAX_MATERIAIS_POR_IMOVEL}
          aria-label="Adicionar material de apresentação"
          className="max-w-xs"
        />
        {enviando && <span className="text-xs text-muted-foreground">Enviando...</span>}
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
