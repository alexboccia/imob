"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatarPreco, formatarLocalizacaoImovel } from "@/lib/format";
import { montarItensUnidade } from "@/lib/caracteristicas-ficha";
import {
  FORMATOS_ANUNCIO,
  FINALIDADE_ANUNCIO_LABEL,
  opcoesFinalidadeAnuncio,
  finalidadeAnuncioAmbigua,
  precoParaFinalidadeAnuncio,
  nomeArquivoAnuncio,
  type FinalidadeAnuncio,
  type FormatoAnuncioId,
} from "@/lib/anuncio-imovel";

// "Gerar anúncio" (MKT-001) — mesma fonte de dados e mesmas regras do
// Route Handler (anuncio-imovel.ts é compartilhado client/server): a
// lista "o que vai aparecer" usa literalmente as mesmas funções que
// decidem o que entra na imagem final, então as duas nunca podem
// divergir uma da outra.
//
// Preview e exportação são o MESMO fetch (seção 12 do pedido): "Gerar
// prévia" busca a imagem uma vez e guarda o blob; "Baixar" reusa esse
// blob já em memória, nunca uma segunda chamada com lógica própria.
export function GerarAnuncioImovel({
  propertyId,
  titulo,
  cidade,
  purpose,
  price,
  rentPrice,
  neighborhood,
  city,
  state,
  totalArea,
  privateArea,
  bedrooms,
  suites,
  bathrooms,
  parkingSpots,
  fotos,
}: {
  propertyId: string;
  titulo: string;
  cidade: string;
  purpose: string;
  price: number | null;
  rentPrice: number | null;
  neighborhood: string;
  city: string;
  state: string;
  totalArea: number | null;
  privateArea: number | null;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  fotos: { id: string; url: string }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [fotoId, setFotoId] = useState(fotos[0]?.id ?? null);
  const [formatoId, setFormatoId] = useState<FormatoAnuncioId>("feed");
  const ambigua = finalidadeAnuncioAmbigua(purpose);
  const [finalidade, setFinalidade] = useState<FinalidadeAnuncio | null>(
    ambigua ? null : opcoesFinalidadeAnuncio(purpose)[0] ?? null
  );
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [imagemUrl, setImagemUrl] = useState<string | null>(null);
  const blobAtual = useRef<Blob | null>(null);

  function limparPreview() {
    if (imagemUrl) URL.revokeObjectURL(imagemUrl);
    setImagemUrl(null);
    blobAtual.current = null;
  }

  // Revoga o object URL ao desmontar — sem isto o blob fica retido na
  // memória do navegador mesmo depois do diálogo fechar.
  useEffect(() => () => {
    if (imagemUrl) URL.revokeObjectURL(imagemUrl);
  }, [imagemUrl]);

  const itens = montarItensUnidade({
    totalArea,
    privateArea,
    bedrooms,
    suites,
    bathrooms,
    parkingSpots,
    propertyFeatures: [],
  })
    .filter((item) => item.icone !== "catalogo")
    .map((item) => item.texto);
  const localizacao = formatarLocalizacaoImovel(neighborhood, city, state);
  const precoResolvido = finalidade
    ? precoParaFinalidadeAnuncio(finalidade, { price, rentPrice })
    : null;

  async function gerarPreview() {
    if (!fotoId || (ambigua && !finalidade)) return;
    setCarregando(true);
    setErro(null);
    try {
      const params = new URLSearchParams({ mediaId: fotoId, formato: formatoId });
      if (finalidade) params.set("finalidade", finalidade);
      const resposta = await fetch(
        `/api/admin/imoveis/${propertyId}/anuncio?${params.toString()}`
      );
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        setErro(corpo?.erro ?? "Não foi possível gerar o anúncio.");
        limparPreview();
        return;
      }
      const blob = await resposta.blob();
      limparPreview();
      blobAtual.current = blob;
      setImagemUrl(URL.createObjectURL(blob));
    } catch {
      setErro("Não foi possível gerar o anúncio.");
      limparPreview();
    } finally {
      setCarregando(false);
    }
  }

  function baixar() {
    if (!blobAtual.current || !imagemUrl) return;
    const formato = FORMATOS_ANUNCIO.find((f) => f.id === formatoId);
    const link = document.createElement("a");
    link.href = imagemUrl;
    link.download = nomeArquivoAnuncio({ titulo, cidade, formatoId: formato?.id ?? "feed" });
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(valor) => {
        setAberto(valor);
        if (!valor) {
          limparPreview();
          setErro(null);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        Criar anúncio
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar anúncio</DialogTitle>
          <DialogDescription>
            Gere uma imagem de divulgação deste imóvel a partir de uma foto real e dos
            dados já cadastrados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {fotos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Este imóvel ainda não tem fotos cadastradas. Adicione uma foto para gerar
              um anúncio.
            </p>
          ) : (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">Foto</span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Escolher foto">
                {fotos.map((foto, indice) => (
                  <button
                    key={foto.id}
                    type="button"
                    aria-pressed={fotoId === foto.id}
                    aria-label={`Foto ${indice + 1}`}
                    onClick={() => setFotoId(foto.id)}
                    className={`overflow-hidden rounded-lg border-2 transition-colors ${
                      fotoId === foto.id ? "border-primary" : "border-transparent"
                    }`}
                  >
                    <Image
                      src={foto.url}
                      alt={`Foto ${indice + 1} do imóvel`}
                      width={88}
                      height={88}
                      className="size-22 object-cover"
                      unoptimized
                    />
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="text-sm font-medium">Formato</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Escolher formato">
              {FORMATOS_ANUNCIO.map((formato) => (
                <Button
                  key={formato.id}
                  type="button"
                  variant={formatoId === formato.id ? "default" : "outline"}
                  size="sm"
                  aria-pressed={formatoId === formato.id}
                  onClick={() => setFormatoId(formato.id)}
                >
                  {formato.rotulo}
                </Button>
              ))}
            </div>
          </div>

          {ambigua && (
            <div className="space-y-1.5">
              <span className="text-sm font-medium">
                Este imóvel aceita venda e aluguel — anunciar como
              </span>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Escolher finalidade">
                {opcoesFinalidadeAnuncio(purpose).map((opcao) => (
                  <Button
                    key={opcao}
                    type="button"
                    variant={finalidade === opcao ? "default" : "outline"}
                    size="sm"
                    aria-pressed={finalidade === opcao}
                    onClick={() => setFinalidade(opcao)}
                  >
                    {FINALIDADE_ANUNCIO_LABEL[opcao]}
                  </Button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-medium">O que vai aparecer no anúncio</p>
            <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
              <li>
                {finalidade
                  ? `${FINALIDADE_ANUNCIO_LABEL[finalidade]} — ${
                      precoResolvido !== null ? formatarPreco(precoResolvido) : "sem preço informado"
                    }`
                  : "Escolha a finalidade acima para ver o preço"}
              </li>
              <li>{localizacao}</li>
              {itens.length > 0 && <li>{itens.join(" · ")}</li>}
            </ul>
          </div>

          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}

          {imagemUrl && (
            <div className="flex justify-center rounded-lg border bg-muted/20 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL gerado no cliente, fora do domínio que next/image otimiza */}
              <img
                src={imagemUrl}
                alt={`Prévia do anúncio de ${titulo}`}
                className="max-h-[50vh] w-auto max-w-full rounded"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button
            type="button"
            onClick={gerarPreview}
            disabled={carregando || fotos.length === 0 || !fotoId || (ambigua && !finalidade)}
          >
            {carregando ? "Gerando..." : "Gerar prévia"}
          </Button>
          <Button type="button" variant="outline" onClick={baixar} disabled={!imagemUrl}>
            Baixar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
