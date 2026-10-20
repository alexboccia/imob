"use client";

import { useActionState } from "react";
import { criarInteressePessoa } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { normalizarTexto } from "@/lib/texto";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxClear,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";
import { SeletorResponsavel } from "@/components/admin/SeletorResponsavel";
import type { OpcaoResponsavel } from "@/lib/responsavel-negociacao";

type ImovelDisponivel = {
  id: string;
  title: string;
  code: number;
  neighborhood: string | null;
  city: string;
};

type ItemImovel = { value: string; label: string };

// Mesmo normalizador já usado no filtro avançado de /imoveis e no
// Combobox de Cidade/Bairro da Home (PainelBuscaHome.tsx) — "sao" ou
// "vila mariana" encontram o imóvel do mesmo jeito, acentuado ou não. O
// `label` já carrega código + título + bairro/cidade, então filtrar por
// ele sozinho já cobre os três critérios pedidos (código, bairro,
// nome) sem precisar de uma segunda função de busca por campo.
function filtroImovel(item: ItemImovel, query: string): boolean {
  return normalizarTexto(item.label).includes(normalizarTexto(query));
}

function rotuloImovel(imovel: ImovelDisponivel): string {
  const local = imovel.neighborhood ? `${imovel.neighborhood}, ${imovel.city}` : imovel.city;
  return `#${imovel.code} — ${imovel.title} — ${local}`;
}

export function RelacionarImovelForm({
  pessoaId,
  imoveisDisponiveis,
  membros,
  membroAtualId,
}: {
  pessoaId: string;
  imoveisDisponiveis: ImovelDisponivel[];
  // Fase 11 — membros ativos da organização e o vínculo de quem está
  // logado, para o seletor de responsável nascer preenchido com ele.
  membros: OpcaoResponsavel[];
  membroAtualId?: string | null;
}) {
  const acao = criarInteressePessoa.bind(null, pessoaId);
  const [estado, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);

  if (imoveisDisponiveis.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum imóvel disponível pra relacionar.
      </p>
    );
  }

  // Item = { value, label }: o Combobox usa esse formato pra submeter
  // `value` (o id, o que a Server Action espera em `propertyId`) e
  // mostrar `label` (código + título + bairro/cidade) — sem precisar de
  // itemToStringValue/itemToStringLabel próprios (ver ComboboxRoot).
  const itens: ItemImovel[] = imoveisDisponiveis.map((imovel) => ({
    value: imovel.id,
    label: rotuloImovel(imovel),
  }));

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      {estado.message && !estado.success && (
        <Alert variant="destructive" className="sm:order-3 sm:basis-full">
          <AlertDescription>{estado.message}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-1.5 w-full sm:max-w-sm">
        {/* Rótulo visível (era sr-only) — era o motivo do campo parecer
            desalinhado com "Responsável pela negociação", ao lado: um
            tinha label visível empurrando o controle pra baixo, o outro
            não, então os dois controles não ficavam na mesma altura
            mesmo com items-end na linha. */}
        <Label htmlFor="relacionar-imovel-busca">Imóvel</Label>
        <Combobox items={itens} filter={filtroImovel} autoHighlight name="propertyId">
          {/* h-9: mesma altura do <select> de SeletorResponsavel, ao
              lado (ComboboxInputGroup nasce h-12, pensado pro buscador
              da Home) — só o tamanho muda, nenhum outro comportamento do
              primitivo compartilhado. */}
          <ComboboxInputGroup className="h-9">
            <ComboboxInput
              id="relacionar-imovel-busca"
              placeholder="Buscar por código, bairro ou nome..."
              className="pr-8 text-sm"
            />
            <div className="absolute right-1 flex items-center">
              <ComboboxClear aria-label="Limpar imóvel" />
            </div>
          </ComboboxInputGroup>
          <ComboboxContent>
            <ComboboxEmpty>Nenhum imóvel encontrado.</ComboboxEmpty>
            <ComboboxList>
              {(item: ItemImovel) => <ComboboxItem key={item.value} value={item}>{item.label}</ComboboxItem>}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>
      {/* Fase 11 — nasce com o membro logado selecionado, e ele pode
          trocar ANTES de salvar: quem cria costuma ser quem assume, mas
          não é uma regra que o produto possa afirmar sozinho. Trocar
          aqui é mais barato que transferir depois. */}
      <div className="w-full sm:max-w-xs">
        <SeletorResponsavel
          id="responsavelId"
          membros={membros}
          valorInicial={membroAtualId ?? ""}
          rotuloVazio="Sem responsável"
        />
      </div>
      {/* variant default (preto) — igual ao botão "Registrar" de
          "Registrar nova interação", abaixo desta mesma ficha. */}
      <Button type="submit" disabled={pendente}>
        {pendente ? "Relacionando..." : "Relacionar imóvel"}
      </Button>
    </form>
  );
}
