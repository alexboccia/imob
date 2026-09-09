"use client";

import { useActionState, useState } from "react";
import { AlertCircle } from "lucide-react";
import { solicitarMateriais } from "@/app/[orgSlug]/actions";
import { CamposAntiSpam } from "@/components/CamposAntiSpam";
import { CamposAtribuicao } from "@/components/CamposAtribuicao";
import { IconeCheck, IconeDocumento, IconeDownload } from "@/components/icons";
import { CampoTelefone } from "@/components/CampoTelefone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TITULO_BLOCO } from "@/lib/site-typography";
import { tituloDosMateriais, type MaterialPublico } from "@/lib/materiais-imovel";

// Bloco de conversão dos materiais de apresentação.
//
// A lista exibida é a dos materiais REAIS e ativos do imóvel — não há
// item decorativo nenhum. O componente só é renderizado quando existe ao
// menos um (a decisão é do servidor, ver blocoDeMateriaisVisivel), então
// o CTA nunca promete arquivo inexistente.
//
// As URLs dos arquivos NÃO estão nesta primeira renderização: elas só
// chegam na resposta da action, depois de uma captação válida. É por isso
// que o HTML público da ficha não carrega link de PDF nenhum — e por isso
// que buscador nenhum indexa o material. O que este bloco não faz é
// fingir mais do que isso: quem recebeu o arquivo pode repassá-lo, e
// nenhuma tecnologia deste lado muda esse fato.

const estadoInicial = {
  sucesso: false,
  erro: undefined as string | undefined,
  materiais: undefined as MaterialPublico[] | undefined,
};

export function MateriaisImovel({
  imovelId,
  isLaunch,
  materiais,
  orgSlug,
}: {
  imovelId: string;
  isLaunch: boolean;
  /** Só nome e id: a URL do arquivo não vem para o cliente antes da captação. */
  materiais: { id: string; name: string }[];
  orgSlug: string;
}) {
  const [formularioAberto, setFormularioAberto] = useState(false);
  // Instante em que o BLOCO apareceu na tela, não em que o formulário
  // abriu — ver CamposAntiSpam.
  const [blocoRenderizadoEm] = useState(() => Date.now());
  const [estado, formAction, pendente] = useActionState(
    solicitarMateriais.bind(null, orgSlug),
    estadoInicial
  );

  const entregues = estado.sucesso ? (estado.materiais ?? []) : null;

  return (
    <section
      data-materiais-imovel
      className="rounded-xl border bg-secondary/40 p-6"
      aria-labelledby="materiais-titulo"
    >
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 id="materiais-titulo" className={TITULO_BLOCO}>
            {tituloDosMateriais(isLaunch)}
          </h2>

          {entregues ? (
            <>
              <p className="mt-2 text-sm text-gray-700">
                Prontos para baixar. Nossa equipe também entrará em contato.
              </p>
              <ul className="mt-4 space-y-2">
                {entregues.map((material) => (
                  <li key={material.id}>
                    <a
                      href={material.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-link hover:underline"
                    >
                      <IconeDownload className="size-5 shrink-0" aria-hidden />
                      {material.name}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <ul className="mt-4 space-y-2">
                {materiais.map((material) => (
                  <li
                    key={material.id}
                    className="flex items-start gap-2.5 text-[0.9375rem] leading-6 text-gray-700"
                  >
                    <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center text-success">
                      <IconeCheck className="size-5" />
                    </span>
                    <span className="min-w-0">{material.name}</span>
                  </li>
                ))}
              </ul>

              {formularioAberto ? (
                <form action={formAction} className="mt-5 max-w-md space-y-3">
                  <CamposAntiSpam renderizadoEm={blocoRenderizadoEm} />
                  <CamposAtribuicao />
                  <input type="hidden" name="imovelId" value={imovelId} />
                  <div className="space-y-1">
                    <Label htmlFor="materiais-nome">Nome</Label>
                    <Input id="materiais-nome" name="nome" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="materiais-telefone">Telefone</Label>
                    <CampoTelefone id="materiais-telefone" name="telefone" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="materiais-email">E-mail</Label>
                    <Input id="materiais-email" name="email" type="email" />
                  </div>
                  {estado.erro && (
                    <Alert variant="destructive">
                      <AlertCircle />
                      <AlertDescription>{estado.erro}</AlertDescription>
                    </Alert>
                  )}
                  <Button type="submit" disabled={pendente}>
                    {pendente ? "Enviando..." : "Receber materiais"}
                  </Button>
                  <p className="text-xs text-gray-500">
                    Informe e-mail ou telefone. Seus dados serão usados apenas para
                    enviarmos os materiais e retornarmos seu contato sobre este imóvel.
                  </p>
                </form>
              ) : (
                <Button
                  type="button"
                  className="mt-5"
                  onClick={() => setFormularioAberto(true)}
                >
                  Receber materiais
                </Button>
              )}
            </>
          )}
        </div>

        {/* Composição em CSS com o ícone de documento do próprio conjunto
            do projeto — nenhuma imagem decorativa inventada, nenhum
            arquivo externo, nada que finja ser a capa de um book que
            ninguém enviou. Escondido no mobile: ali o espaço é do
            conteúdo. */}
        <div aria-hidden className="hidden shrink-0 sm:block">
          <div className="relative h-28 w-24">
            <div className="absolute inset-0 translate-x-3 rotate-6 rounded-lg border bg-background/70" />
            <div className="absolute inset-0 flex items-center justify-center rounded-lg border bg-background text-primary">
              <IconeDocumento className="size-10" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
