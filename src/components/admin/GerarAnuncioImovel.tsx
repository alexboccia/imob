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
  nomeArquivoCarrossel,
  papelPorPosicao,
  quantidadeDeSlidesValida,
  LIMITE_SLIDES_CARROSSEL,
  type FinalidadeAnuncio,
  type FormatoAnuncioId,
} from "@/lib/anuncio-imovel";
import {
  CANAIS_LEGENDA,
  montarFatosLegenda,
  formatarLegenda,
  type CanalLegenda,
} from "@/lib/legenda-imovel";

type Foto = { id: string; url: string };

// "Gerar anúncio" (MKT-001) + "Carrossel" (MKT-002) — mesma fonte de
// dados e mesmas regras do Route Handler (anuncio-imovel.ts é
// compartilhado client/server): a lista "o que vai aparecer" usa
// literalmente as mesmas funções que decidem o que entra na imagem
// final, então as duas nunca podem divergir uma da outra.
//
// Preview e exportação são o MESMO fetch, em imagem única e em cada
// slide do carrossel (seção 12/17 do pedido de MKT-002): "Gerar" busca a
// imagem uma vez e guarda o blob; "Baixar" reusa esse blob já em
// memória, nunca uma segunda chamada com lógica própria.
//
// Carrossel é O MESMO endpoint chamado uma vez por slide (papel=capa
// na primeira foto escolhida, cta na última, foto nas do meio) — nunca
// um payload com várias mídias de uma vez (seção 21: o cliente só
// informa intenção — mediaId, ordem, finalidade — o servidor resolve os
// dados reais).
export function GerarAnuncioImovel({
  propertyId,
  titulo,
  tipo,
  cidade,
  purpose,
  price,
  rentPrice,
  condoFee,
  propertyTax,
  neighborhood,
  city,
  state,
  totalArea,
  privateArea,
  bedrooms,
  suites,
  bathrooms,
  parkingSpots,
  nomeOrganizacao,
  whatsapp,
  fotos,
}: {
  propertyId: string;
  titulo: string;
  tipo: string;
  cidade: string;
  purpose: string;
  price: number | null;
  rentPrice: number | null;
  condoFee: number | null;
  propertyTax: number | null;
  neighborhood: string;
  city: string;
  state: string;
  totalArea: number | null;
  privateArea: number | null;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parkingSpots: number | null;
  nomeOrganizacao: string;
  whatsapp: string | null;
  fotos: Foto[];
}) {
  const [aberto, setAberto] = useState(false);
  // "imagem" é o padrão: quem só quer o fluxo de sempre não ganha
  // nenhum passo extra (seção 33) — o seletor de modo é visível, mas a
  // primeira opção já é o comportamento de antes desta mudança.
  const [modo, setModo] = useState<"imagem" | "carrossel" | "legenda">("imagem");

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

  // Carrossel — ordem é a ordem de SELEÇÃO (seção 10/11): a capa real do
  // Property nunca é tocada por esta tela; "foto usada como capa do
  // carrossel" é só a primeira da lista escolhida aqui.
  const [selecionadas, setSelecionadas] = useState<string[]>([]);
  const [carregandoCarrossel, setCarregandoCarrossel] = useState(false);
  const [erroCarrossel, setErroCarrossel] = useState<string | null>(null);
  const [slides, setSlides] = useState<{ blob: Blob; url: string }[] | null>(null);
  const [indiceSlide, setIndiceSlide] = useState(0);

  // Legenda (MKT-003) — texto por canal, editado localmente. Nunca
  // persistido (seção 22/27): some ao fechar o diálogo, como tudo nesta
  // tela. Cada canal guarda a SUA edição independente — trocar de canal
  // nunca apaga o que foi editado no outro (seção 24).
  const [canalLegenda, setCanalLegenda] = useState<CanalLegenda>("instagram");
  const [textosPorCanal, setTextosPorCanal] = useState<Partial<Record<CanalLegenda, string>>>({});
  const [copiado, setCopiado] = useState(false);
  const [erroCopiar, setErroCopiar] = useState<string | null>(null);

  // Trocar a finalidade muda o preço embutido no texto — qualquer edição
  // já feita passaria a descrever um valor que não é mais o escolhido,
  // então o rascunho por canal é descartado aqui (comportamento simples
  // e documentado, seção 24), nunca silenciosamente misturado.
  function escolherFinalidade(opcao: FinalidadeAnuncio) {
    setFinalidade(opcao);
    setTextosPorCanal({});
    setCopiado(false);
  }

  function limparPreview() {
    if (imagemUrl) URL.revokeObjectURL(imagemUrl);
    setImagemUrl(null);
    blobAtual.current = null;
  }

  function limparSlides() {
    slides?.forEach((s) => URL.revokeObjectURL(s.url));
    setSlides(null);
    setIndiceSlide(0);
  }

  // Revoga os object URLs ao desmontar — sem isto o blob fica retido na
  // memória do navegador mesmo depois do diálogo fechar.
  useEffect(
    () => () => {
      if (imagemUrl) URL.revokeObjectURL(imagemUrl);
      slides?.forEach((s) => URL.revokeObjectURL(s.url));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a limpeza final importa; não precisa reexecutar a cada troca de slide.
    []
  );

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

  // Fatos da legenda só existem quando a finalidade já foi resolvida —
  // mesma regra de SALE_AND_RENT do material visual: nunca escolher
  // sozinho (seção 16).
  const fatosLegenda = finalidade
    ? montarFatosLegenda({
        type: tipo,
        finalidade,
        precos: { price, rentPrice },
        condoFee,
        propertyTax,
        neighborhood,
        city,
        state,
        totalArea,
        privateArea,
        bedrooms,
        suites,
        bathrooms,
        parkingSpots,
        nomeOrganizacao,
        whatsapp,
      })
    : null;
  const legendaSugerida = fatosLegenda
    ? formatarLegenda(canalLegenda, fatosLegenda, { bairro: neighborhood || null, cidade: city })
    : "";
  const legendaAtual = textosPorCanal[canalLegenda] ?? legendaSugerida;

  async function copiarLegenda() {
    setErroCopiar(null);
    try {
      await navigator.clipboard.writeText(legendaAtual);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setErroCopiar("Não foi possível copiar automaticamente — selecione o texto e copie manualmente.");
    }
  }

  function restaurarSugestaoLegenda() {
    setTextosPorCanal((atual) => {
      const copia = { ...atual };
      delete copia[canalLegenda];
      return copia;
    });
    setCopiado(false);
  }

  function baixarBlob(blob: Blob, nomeArquivo: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Um object URL próprio desta função, revogado logo depois do clique
    // — não é o mesmo que alimenta a prévia (esse continua vivo até o
    // diálogo fechar ou gerar de novo).
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function buscarSlide(mediaId: string, papel: "capa" | "foto" | "cta"): Promise<Blob> {
    const params = new URLSearchParams({ mediaId, formato: "feed", papel });
    if (finalidade) params.set("finalidade", finalidade);
    const resposta = await fetch(`/api/admin/imoveis/${propertyId}/anuncio?${params.toString()}`);
    if (!resposta.ok) {
      const corpo = await resposta.json().catch(() => null);
      throw new Error(corpo?.erro ?? "Não foi possível gerar esta imagem.");
    }
    return resposta.blob();
  }

  async function gerarPreview() {
    if (!fotoId || (ambigua && !finalidade)) return;
    setCarregando(true);
    setErro(null);
    try {
      // Imagem única mantém o parâmetro "formato" livre (feed/story/
      // whatsapp) e nunca envia "papel" — a rota resolve a ausência como
      // "capa" (seção 12.K), o mesmo comportamento de sempre.
      const params = new URLSearchParams({ mediaId: fotoId, formato: formatoId });
      if (finalidade) params.set("finalidade", finalidade);
      const resposta = await fetch(
        `/api/admin/imoveis/${propertyId}/anuncio?${params.toString()}`
      );
      if (!resposta.ok) {
        const corpo = await resposta.json().catch(() => null);
        throw new Error(corpo?.erro ?? "Não foi possível gerar o anúncio.");
      }
      const blob = await resposta.blob();
      limparPreview();
      blobAtual.current = blob;
      setImagemUrl(URL.createObjectURL(blob));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível gerar o anúncio.");
      limparPreview();
    } finally {
      setCarregando(false);
    }
  }

  function alternarSelecao(id: string) {
    setSelecionadas((atual) => {
      if (atual.includes(id)) return atual.filter((x) => x !== id);
      if (atual.length >= LIMITE_SLIDES_CARROSSEL.max) return atual;
      return [...atual, id];
    });
    limparSlides();
    setErroCarrossel(null);
  }

  function mover(indice: number, direcao: -1 | 1) {
    setSelecionadas((atual) => {
      const alvo = indice + direcao;
      if (alvo < 0 || alvo >= atual.length) return atual;
      const copia = [...atual];
      [copia[indice], copia[alvo]] = [copia[alvo], copia[indice]];
      return copia;
    });
    limparSlides();
  }

  async function gerarCarrossel() {
    if (!quantidadeDeSlidesValida(selecionadas.length) || (ambigua && !finalidade)) return;
    setCarregandoCarrossel(true);
    setErroCarrossel(null);
    limparSlides();
    const total = selecionadas.length;
    const gerados: { blob: Blob; url: string }[] = [];
    try {
      // Sequencial, não Promise.all: até 8 fetches de imagem (cada um já
      // faz seu próprio download de foto + logo no servidor) — paralelizar
      // tudo de uma vez multiplicaria a carga de rede/sharp no servidor
      // sem necessidade (seção 22). Uma falha pára a geração inteira em
      // vez de fingir um carrossel mais curto (seção 23).
      for (let indice = 0; indice < total; indice++) {
        const mediaId = selecionadas[indice];
        const papel = papelPorPosicao(indice, total);
        const blob = await buscarSlide(mediaId, papel);
        gerados.push({ blob, url: URL.createObjectURL(blob) });
      }
      setSlides(gerados);
      setIndiceSlide(0);
    } catch (e) {
      gerados.forEach((s) => URL.revokeObjectURL(s.url));
      const posicao = gerados.length + 1;
      setErroCarrossel(
        `${e instanceof Error ? e.message : "Não foi possível gerar o carrossel."} (slide ${posicao} de ${total}). Ajuste a seleção e tente novamente.`
      );
    } finally {
      setCarregandoCarrossel(false);
    }
  }

  function baixarSlideAtual() {
    if (!slides) return;
    baixarBlob(
      slides[indiceSlide].blob,
      nomeArquivoCarrossel({ titulo, cidade, indice: indiceSlide, total: slides.length })
    );
  }

  function baixarTodosOsSlides() {
    if (!slides) return;
    slides.forEach((slide, indice) => {
      baixarBlob(slide.blob, nomeArquivoCarrossel({ titulo, cidade, indice, total: slides.length }));
    });
  }

  function baixarImagemUnica() {
    if (!blobAtual.current) return;
    const formato = FORMATOS_ANUNCIO.find((f) => f.id === formatoId);
    baixarBlob(
      blobAtual.current,
      nomeArquivoAnuncio({ titulo, cidade, formatoId: formato?.id ?? "feed" })
    );
  }

  function fecharDialogo(valor: boolean) {
    setAberto(valor);
    if (!valor) {
      limparPreview();
      limparSlides();
      setErro(null);
      setErroCarrossel(null);
      // Legenda nunca é persistida (seção 22/27) — some ao fechar, como
      // o resto desta tela.
      setTextosPorCanal({});
      setCopiado(false);
      setErroCopiar(null);
    }
  }

  const semFotos = fotos.length === 0;
  const quantidadeValida = quantidadeDeSlidesValida(selecionadas.length);

  return (
    <Dialog open={aberto} onOpenChange={fecharDialogo}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        Criar anúncio
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar anúncio</DialogTitle>
          <DialogDescription>
            Gere uma imagem de divulgação deste imóvel a partir de fotos reais e dos
            dados já cadastrados.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-1.5">
            <span className="text-sm font-medium">Tipo de material</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo de material">
              <Button
                type="button"
                variant={modo === "imagem" ? "default" : "outline"}
                size="sm"
                aria-pressed={modo === "imagem"}
                onClick={() => setModo("imagem")}
                disabled={semFotos}
              >
                Imagem única
              </Button>
              <Button
                type="button"
                variant={modo === "carrossel" ? "default" : "outline"}
                size="sm"
                aria-pressed={modo === "carrossel"}
                onClick={() => setModo("carrossel")}
                disabled={fotos.length < 2}
              >
                Carrossel
              </Button>
              {/* Legenda não depende de foto nenhuma — é texto derivado
                  dos mesmos dados cadastrais, por isso nunca fica
                  desabilitada por causa de fotos (diferente dos dois
                  modos visuais acima). */}
              <Button
                type="button"
                variant={modo === "legenda" ? "default" : "outline"}
                size="sm"
                aria-pressed={modo === "legenda"}
                onClick={() => setModo("legenda")}
              >
                Legenda
              </Button>
            </div>
            {modo === "carrossel" && fotos.length < 2 && (
              <p className="text-xs text-muted-foreground">
                É preciso pelo menos {LIMITE_SLIDES_CARROSSEL.min} fotos cadastradas para um
                carrossel.
              </p>
            )}
          </div>

          {semFotos && modo !== "legenda" ? (
            <p className="text-sm text-muted-foreground">
              Este imóvel ainda não tem fotos cadastradas. Adicione uma foto para gerar
              um anúncio.
            </p>
          ) : modo === "imagem" ? (
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
          ) : modo === "carrossel" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <span className="text-sm font-medium">
                  Fotos ({selecionadas.length}/{LIMITE_SLIDES_CARROSSEL.max})
                </span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Selecionar fotos do carrossel">
                  {fotos.map((foto, indice) => {
                    const posicao = selecionadas.indexOf(foto.id);
                    const selecionada = posicao !== -1;
                    return (
                      <button
                        key={foto.id}
                        type="button"
                        aria-pressed={selecionada}
                        aria-label={
                          selecionada
                            ? `Foto ${indice + 1}, selecionada, posição ${posicao + 1}`
                            : `Foto ${indice + 1}`
                        }
                        onClick={() => alternarSelecao(foto.id)}
                        className={`relative overflow-hidden rounded-lg border-2 transition-colors ${
                          selecionada ? "border-primary" : "border-transparent"
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
                        {selecionada && (
                          <span
                            aria-hidden
                            className="absolute left-1 top-1 flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
                          >
                            {posicao + 1}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {!quantidadeValida && (
                  <p className="text-xs text-muted-foreground">
                    Selecione entre {LIMITE_SLIDES_CARROSSEL.min} e {LIMITE_SLIDES_CARROSSEL.max}{" "}
                    fotos para montar o carrossel.
                  </p>
                )}
              </div>

              {selecionadas.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">Ordem do carrossel</span>
                  <ol className="space-y-1">
                    {selecionadas.map((id, indice) => {
                      const foto = fotos.find((f) => f.id === id);
                      if (!foto) return null;
                      return (
                        <li
                          key={id}
                          className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1 text-sm"
                        >
                          <span className="w-5 shrink-0 text-center font-medium">{indice + 1}</span>
                          <Image
                            src={foto.url}
                            alt=""
                            width={32}
                            height={32}
                            className="size-8 shrink-0 rounded object-cover"
                            unoptimized
                          />
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {indice === 0 ? "Capa" : indice === selecionadas.length - 1 ? "CTA final" : "Foto"}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Subir foto ${indice + 1} na ordem`}
                            disabled={indice === 0}
                            onClick={() => mover(indice, -1)}
                          >
                            Subir
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            aria-label={`Descer foto ${indice + 1} na ordem`}
                            disabled={indice === selecionadas.length - 1}
                            onClick={() => mover(indice, 1)}
                          >
                            Descer
                          </Button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <span className="text-sm font-medium">Canal</span>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Escolher canal da legenda">
                  {CANAIS_LEGENDA.map((canal) => (
                    <Button
                      key={canal.id}
                      type="button"
                      variant={canalLegenda === canal.id ? "default" : "outline"}
                      size="sm"
                      aria-pressed={canalLegenda === canal.id}
                      onClick={() => {
                        setCanalLegenda(canal.id);
                        setCopiado(false);
                      }}
                    >
                      {canal.rotulo}
                    </Button>
                  ))}
                </div>
              </div>

              {!fatosLegenda ? (
                <p className="text-sm text-muted-foreground">
                  Escolha a finalidade abaixo para gerar a legenda.
                </p>
              ) : (
                <div className="space-y-1.5">
                  <label htmlFor="legenda-texto" className="text-sm font-medium">
                    Legenda ({CANAIS_LEGENDA.find((c) => c.id === canalLegenda)?.rotulo})
                  </label>
                  <textarea
                    id="legenda-texto"
                    value={legendaAtual}
                    onChange={(e) => {
                      setTextosPorCanal((atual) => ({ ...atual, [canalLegenda]: e.target.value }));
                      setCopiado(false);
                    }}
                    rows={8}
                    className="w-full resize-y rounded-lg border bg-background p-3 text-sm"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={restaurarSugestaoLegenda}>
                      Restaurar sugestão
                    </Button>
                    {copiado && (
                      <span role="status" className="text-xs text-muted-foreground">
                        Legenda copiada
                      </span>
                    )}
                  </div>
                  {erroCopiar && (
                    <p role="alert" className="text-sm text-destructive">
                      {erroCopiar}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {modo === "imagem" && !semFotos && (
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
          )}

          {modo === "carrossel" && !semFotos && (
            <p className="text-xs text-muted-foreground">
              O carrossel é gerado no formato Instagram Feed (1080×1350).
            </p>
          )}

          {ambigua && (!semFotos || modo === "legenda") && (
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
                    onClick={() => escolherFinalidade(opcao)}
                  >
                    {FINALIDADE_ANUNCIO_LABEL[opcao]}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {(!semFotos || modo === "legenda") && (
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
          )}

          {modo === "imagem" && erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          {modo === "carrossel" && erroCarrossel && (
            <p role="alert" className="text-sm text-destructive">
              {erroCarrossel}
            </p>
          )}

          {modo === "imagem" && imagemUrl && (
            <div className="flex justify-center rounded-lg border bg-muted/20 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL gerado no cliente, fora do domínio que next/image otimiza */}
              <img
                src={imagemUrl}
                alt={`Prévia do anúncio de ${titulo}`}
                className="max-h-[50vh] w-auto max-w-full rounded"
              />
            </div>
          )}

          {modo === "carrossel" && slides && slides.length > 0 && (
            <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Slide anterior"
                  disabled={indiceSlide === 0}
                  onClick={() => setIndiceSlide((i) => i - 1)}
                >
                  Anterior
                </Button>
                <span className="text-sm text-muted-foreground" aria-live="polite">
                  {indiceSlide + 1}/{slides.length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Próximo slide"
                  disabled={indiceSlide === slides.length - 1}
                  onClick={() => setIndiceSlide((i) => i + 1)}
                >
                  Próximo
                </Button>
              </div>
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob: URL gerado no cliente */}
                <img
                  src={slides[indiceSlide].url}
                  alt={`Prévia do slide ${indiceSlide + 1} de ${slides.length} do carrossel de ${titulo}`}
                  className="max-h-[50vh] w-auto max-w-full rounded"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {modo === "imagem" ? (
            <>
              <Button
                type="button"
                onClick={gerarPreview}
                disabled={carregando || semFotos || !fotoId || (ambigua && !finalidade)}
              >
                {carregando ? "Gerando..." : "Gerar prévia"}
              </Button>
              <Button type="button" variant="outline" onClick={baixarImagemUnica} disabled={!imagemUrl}>
                Baixar
              </Button>
            </>
          ) : modo === "carrossel" ? (
            <>
              <Button
                type="button"
                onClick={gerarCarrossel}
                disabled={
                  carregandoCarrossel || !quantidadeValida || (ambigua && !finalidade)
                }
              >
                {carregandoCarrossel ? "Gerando..." : "Gerar carrossel"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={baixarSlideAtual}
                disabled={!slides}
              >
                Baixar este slide
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={baixarTodosOsSlides}
                disabled={!slides}
              >
                Baixar todos
              </Button>
            </>
          ) : (
            <Button type="button" onClick={copiarLegenda} disabled={!fatosLegenda}>
              Copiar legenda
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
