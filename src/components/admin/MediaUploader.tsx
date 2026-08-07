"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { IconeFechar } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type MidiaItem = {
  tipo: "FOTO" | "VIDEO" | "PLANTA";
  url: string;
  ehCapa: boolean;
};

export function MediaUploader({
  midiasIniciais = [],
  propertyId,
}: {
  midiasIniciais?: MidiaItem[];
  /** Id do imóvel sendo editado, se já existir (imóvel novo ainda não tem id). */
  propertyId?: string;
}) {
  const [midias, setMidias] = useState<MidiaItem[]>(midiasIniciais);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState<{
    tipo: "FOTO" | "PLANTA";
    atual: number;
    total: number;
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [urlVideo, setUrlVideo] = useState("");
  const [indiceArrastado, setIndiceArrastado] = useState<number | null>(null);
  const [indicePlantaArrastada, setIndicePlantaArrastada] = useState<
    number | null
  >(null);

  const alterado = JSON.stringify(midias) !== JSON.stringify(midiasIniciais);

  useEffect(() => {
    function avisarSaida(event: BeforeUnloadEvent) {
      if (!alterado) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", avisarSaida);
    return () => window.removeEventListener("beforeunload", avisarSaida);
  }, [alterado]);

  async function handleArquivos(
    event: React.ChangeEvent<HTMLInputElement>,
    tipo: "FOTO" | "PLANTA"
  ) {
    const arquivos = event.target.files;
    if (!arquivos || arquivos.length === 0) return;

    setEnviando(true);
    setErro(null);
    const total = arquivos.length;
    setProgresso({ tipo, atual: 0, total });

    const novasMidias: MidiaItem[] = [];
    let concluidos = 0;
    for (const arquivo of Array.from(arquivos)) {
      const formData = new FormData();
      formData.append("arquivo", arquivo);
      formData.append("pasta", "imoveis");
      if (propertyId) formData.append("propertyId", propertyId);
      const resposta = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData,
      });
      const dados = await resposta.json();
      concluidos += 1;
      setProgresso({ tipo, atual: concluidos, total });
      if (!resposta.ok) {
        setErro(dados.erro ?? "Falha ao enviar arquivo");
        continue;
      }
      novasMidias.push({ tipo, url: dados.url, ehCapa: false });
    }

    setMidias((atual) => {
      const combinado = [...atual, ...novasMidias];
      if (tipo === "FOTO" && !combinado.some((m) => m.tipo === "FOTO" && m.ehCapa)) {
        const primeiraFotoIndex = combinado.findIndex((m) => m.tipo === "FOTO");
        if (primeiraFotoIndex !== -1) {
          combinado[primeiraFotoIndex] = {
            ...combinado[primeiraFotoIndex],
            ehCapa: true,
          };
        }
      }
      return combinado;
    });
    setEnviando(false);
    setProgresso(null);
    event.target.value = "";
  }

  function adicionarVideo() {
    if (!urlVideo.trim()) return;
    setMidias((atual) => [
      ...atual,
      { tipo: "VIDEO", url: urlVideo.trim(), ehCapa: false },
    ]);
    setUrlVideo("");
  }

  function definirCapa(index: number) {
    setMidias((atual) =>
      atual.map((m, i) => ({ ...m, ehCapa: i === index }))
    );
  }

  function remover(index: number) {
    setMidias((atual) => atual.filter((_, i) => i !== index));
  }

  function moverMidia(
    tipo: "FOTO" | "PLANTA",
    indexOrigem: number,
    indexDestino: number
  ) {
    setMidias((atual) => {
      const grupoAlvo = atual.filter((m) => m.tipo === tipo);
      const outros = atual.filter((m) => m.tipo !== tipo);
      const reordenado = [...grupoAlvo];
      const [removida] = reordenado.splice(indexOrigem, 1);
      reordenado.splice(indexDestino, 0, removida);
      return tipo === "FOTO"
        ? [...reordenado, ...outros]
        : [...outros, ...reordenado];
    });
  }

  const fotos = midias.filter((m) => m.tipo === "FOTO");
  const videos = midias.filter((m) => m.tipo === "VIDEO");
  const plantas = midias.filter((m) => m.tipo === "PLANTA");

  return (
    <div className="space-y-4">
      <input type="hidden" name="midiasJson" value={JSON.stringify(midias)} />

      <div>
        <label className="block text-sm font-medium mb-1">
          Fotos
          {fotos.length > 0 && (
            <span className="ml-1 font-normal text-gray-500">
              ({fotos.length})
            </span>
          )}
        </label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleArquivos(e, "FOTO")}
          disabled={enviando}
          className="block text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white file:cursor-pointer hover:file:bg-gray-800 active:file:bg-gray-900 file:transition-colors disabled:opacity-50"
        />
        {progresso?.tipo === "FOTO" && (
          <div className="mt-2">
            <div className="h-1.5 w-full max-w-xs rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-black transition-all duration-200"
                style={{
                  width: `${Math.round(
                    (progresso.atual / progresso.total) * 100
                  )}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Enviando {progresso.atual} de {progresso.total}...
            </p>
          </div>
        )}
        {erro && <p className="text-sm text-red-600 mt-1">{erro}</p>}

        {fotos.length > 0 && (
          <>
            <p className="text-xs text-gray-400 mt-3">
              Arraste as fotos para reordenar.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-1">
              {fotos.map((foto, indexFoto) => {
                const index = midias.indexOf(foto);
                return (
                  <div
                    key={foto.url}
                    draggable
                    onDragStart={() => setIndiceArrastado(indexFoto)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (
                        indiceArrastado !== null &&
                        indiceArrastado !== indexFoto
                      ) {
                        moverMidia("FOTO", indiceArrastado, indexFoto);
                      }
                      setIndiceArrastado(null);
                    }}
                    onDragEnd={() => setIndiceArrastado(null)}
                    className={`relative cursor-move ${
                      indiceArrastado === indexFoto ? "opacity-40" : ""
                    }`}
                  >
                    <div className="relative aspect-square bg-gray-100 rounded-md overflow-hidden border">
                      <Image
                        src={foto.url}
                        alt="Foto do imóvel"
                        fill
                        className="object-cover pointer-events-none"
                      />
                      <span className="absolute top-1 left-1 bg-black/60 text-white text-xs rounded px-1.5 py-0.5">
                        {indexFoto + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => remover(index)}
                        aria-label="Remover foto"
                        className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 rounded-full bg-white/90 text-red-600 hover:bg-white"
                      >
                        <IconeFechar className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="mt-1 text-xs">
                      <label className="flex items-center gap-1">
                        <input
                          type="radio"
                          name="capa"
                          checked={foto.ehCapa}
                          onChange={() => definirCapa(index)}
                        />
                        Capa
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Plantas
          {plantas.length > 0 && (
            <span className="ml-1 font-normal text-gray-500">
              ({plantas.length})
            </span>
          )}
        </label>
        <p className="text-xs text-gray-500 mb-1">
          Imagens de plantas do imóvel/empreendimento (opcional).
        </p>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => handleArquivos(e, "PLANTA")}
          disabled={enviando}
          className="block text-sm text-gray-500 file:mr-3 file:rounded-md file:border-0 file:bg-black file:px-4 file:py-2 file:text-sm file:font-medium file:text-white file:cursor-pointer hover:file:bg-gray-800 active:file:bg-gray-900 file:transition-colors disabled:opacity-50"
        />
        {progresso?.tipo === "PLANTA" && (
          <div className="mt-2">
            <div className="h-1.5 w-full max-w-xs rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full bg-black transition-all duration-200"
                style={{
                  width: `${Math.round(
                    (progresso.atual / progresso.total) * 100
                  )}%`,
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Enviando {progresso.atual} de {progresso.total}...
            </p>
          </div>
        )}

        {plantas.length > 0 && (
          <>
            <p className="text-xs text-gray-400 mt-3">
              Arraste as plantas para reordenar.
            </p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mt-1">
              {plantas.map((planta, indexPlanta) => {
                const index = midias.indexOf(planta);
                return (
                  <div
                    key={planta.url}
                    draggable
                    onDragStart={() => setIndicePlantaArrastada(indexPlanta)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (
                        indicePlantaArrastada !== null &&
                        indicePlantaArrastada !== indexPlanta
                      ) {
                        moverMidia(
                          "PLANTA",
                          indicePlantaArrastada,
                          indexPlanta
                        );
                      }
                      setIndicePlantaArrastada(null);
                    }}
                    onDragEnd={() => setIndicePlantaArrastada(null)}
                    className={`relative cursor-move ${
                      indicePlantaArrastada === indexPlanta ? "opacity-40" : ""
                    }`}
                  >
                    <div className="relative aspect-square bg-gray-100 rounded-md overflow-hidden border">
                      <Image
                        src={planta.url}
                        alt="Planta do imóvel"
                        fill
                        className="object-contain pointer-events-none"
                      />
                      <span className="absolute top-1 left-1 bg-black/60 text-white text-xs rounded px-1.5 py-0.5">
                        {indexPlanta + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => remover(index)}
                        aria-label="Remover planta"
                        className="absolute top-1 right-1 flex items-center justify-center w-5 h-5 rounded-full bg-white/90 text-red-600 hover:bg-white"
                      >
                        <IconeFechar className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Vídeos (link do YouTube/Vimeo não listado)
        </label>
        <div className="flex gap-2">
          <Input
            type="text"
            value={urlVideo}
            onChange={(e) => setUrlVideo(e.target.value)}
            placeholder="https://www.youtube.com/embed/..."
            className="flex-1"
          />
          <Button type="button" variant="outline" onClick={adicionarVideo}>
            Adicionar
          </Button>
        </div>
        {videos.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {videos.map((video) => {
              const index = midias.indexOf(video);
              return (
                <li key={video.url} className="flex items-center justify-between">
                  <span className="truncate">{video.url}</span>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => remover(index)}
                    className="text-destructive h-auto p-0 ml-2"
                  >
                    Remover
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
