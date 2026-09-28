"use client";

import { useActionState, useId, useState } from "react";
import { Building2, Plus } from "lucide-react";
import {
  criarEmpreendimento,
  renomearEmpreendimento,
  removerEmpreendimento,
} from "@/app/app/empreendimentos/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { LIMITE_NOME_EMPREENDIMENTO } from "@/lib/empreendimento";
import type { EmpreendimentoDaLista } from "@/lib/empreendimento-consultas";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { EstadoVazio } from "@/components/admin/ui/EstadoVazio";

// Gestão de empreendimentos (Fase 38; redesenho visual na Fase 71).
//
// Fase 71 — o que mudou é só APRESENTAÇÃO: nenhum campo, cálculo, query,
// ordenação ou permissão foi tocado. O card único "Empreendimentos
// cadastrados" (com o formulário de criação dentro do mesmo CardContent)
// virou duas seções (CabecalhoSecao) claramente distintas — listar e
// criar — porque são duas tarefas diferentes, não porque a página
// precisava "parecer mais cheia". Cada `<li>` continua com a MESMA
// anatomia de antes (nome, contagem, renomear, excluir): a ação
// destrutiva já era um botão ghost pequeno e discreto — não havia nada
// para "acalmar" aí.
//
// Gestão SIMPLES de propósito: o empreendimento é identidade, não uma
// ficha. Nome, contagem de unidades e as duas ações. Nada de galeria,
// endereço, construtora ou estágio — esses dados continuam na unidade
// (Property), nunca no Development.

function LinhaEmpreendimento({
  empreendimento,
  podeGerenciar,
}: {
  empreendimento: EmpreendimentoDaLista;
  podeGerenciar: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const renomear = renomearEmpreendimento.bind(null, empreendimento.id);
  const remover = removerEmpreendimento.bind(null, empreendimento.id);
  const [estadoRenomear, formRenomear, renomeando] = useActionState(
    renomear,
    ESTADO_INICIAL_ACAO
  );
  const [estadoRemover, formRemover, removendo] = useActionState(
    remover,
    ESTADO_INICIAL_ACAO
  );
  const idNome = useId();

  return (
    <li className="min-w-0 border-b py-3 last:border-b-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="min-w-0 break-words font-semibold">{empreendimento.nome}</span>
        {/* Contagem em TEXTO, com plural correto: é o dado que explica
            por que a exclusão pode ser recusada. Vem da MESMA consulta da
            listagem — nenhuma query nova só para exibir isto. */}
        <Badge variant="secondary" className="shrink-0">
          {empreendimento.unidades === 1
            ? "1 unidade"
            : `${empreendimento.unidades} unidades`}
        </Badge>
      </div>

      {podeGerenciar && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setEditando((v) => !v)}
          >
            {editando ? "Cancelar" : "Renomear"}
          </Button>
          <form action={formRemover}>
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={removendo}
            >
              {removendo ? "Excluindo..." : "Excluir"}
            </Button>
          </form>
        </div>
      )}

      {editando && (
        <form action={formRenomear} className="mt-2 space-y-2">
          <Label htmlFor={idNome} className="text-xs">
            Novo nome
          </Label>
          <Input
            id={idNome}
            name="nome"
            defaultValue={empreendimento.nome}
            maxLength={LIMITE_NOME_EMPREENDIMENTO}
            aria-invalid={estadoRenomear.fieldErrors?.nome ? true : undefined}
          />
          {estadoRenomear.fieldErrors?.nome && (
            <p className="text-xs text-destructive">{estadoRenomear.fieldErrors.nome[0]}</p>
          )}
          <Button type="submit" size="sm" disabled={renomeando}>
            {renomeando ? "Salvando..." : "Salvar nome"}
          </Button>
        </form>
      )}

      {/* Erros das duas ações, com aria-live: a recusa de exclusão
          ("tem N unidades vinculadas") é justamente o que o gestor
          precisa ler. */}
      {[estadoRenomear, estadoRemover].map((estado, i) =>
        estado.message && !estado.success ? (
          <p key={i} role="alert" className="mt-1 min-w-0 break-words text-xs text-destructive">
            {estado.message}
          </p>
        ) : null
      )}
    </li>
  );
}

export function EmpreendimentosCard({
  empreendimentos,
  podeGerenciar,
}: {
  empreendimentos: EmpreendimentoDaLista[];
  podeGerenciar: boolean;
}) {
  const [estado, formAction, pendente] = useActionState(
    criarEmpreendimento,
    ESTADO_INICIAL_ACAO
  );
  const idNovo = useId();

  return (
    <div className="space-y-8">
      <section className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={Building2}
          titulo="Empreendimentos cadastrados"
          // Confirmada em actions.ts: a exclusão é RECUSADA enquanto
          // houver unidade vinculada (a FK é SET NULL, mas desvincular
          // dezenas de imóveis em silêncio seria destrutivo na prática) —
          // nunca apaga nem desvincula automaticamente. Texto sugerido no
          // prompt é fiel à regra real, preservado.
          descricao="Veja os empreendimentos da sua imobiliária. Excluir um empreendimento nunca apaga imóveis — é preciso desvincular as unidades antes."
        />

        <Card className="min-w-0">
          <CardContent className="min-w-0">
            {empreendimentos.length === 0 ? (
              <EstadoVazio
                icone={Building2}
                titulo="Nenhum empreendimento cadastrado"
                descricao="Cadastre seus empreendimentos para organizar os imóveis que são unidades do mesmo empreendimento."
              />
            ) : (
              <ul className="min-w-0 text-sm">
                {empreendimentos.map((e) => (
                  <LinhaEmpreendimento
                    key={e.id}
                    empreendimento={e}
                    podeGerenciar={podeGerenciar}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      {/* A seção inteira — cabeçalho incluso — só existe para quem pode
          criar: um título "Novo empreendimento" sem formulário embaixo
          seria uma seção quebrada para o BROKER/ASSISTANT que só lê a
          lista acima. Mesmo comportamento de antes (o bloco de criação
          já era condicional a `podeGerenciar`), só reorganizado. */}
      {podeGerenciar && (
        <section className="min-w-0 space-y-4">
          <CabecalhoSecao
            icone={Plus}
            titulo="Novo empreendimento"
            descricao="Digite o nome do empreendimento para cadastrá-lo."
          />

          <Card className="min-w-0">
            <CardContent className="min-w-0">
              <form action={formAction} className="space-y-2">
                {/* Texto igual ao título da seção logo acima — visível ali
                    já seria redundante na tela. O label continua existindo
                    de verdade (associado por htmlFor, lido por leitor de
                    tela e pelos testes via getByLabel), só não duplicado
                    visualmente: o sketch da Fase 71 não mostra uma
                    segunda linha "Novo empreendimento" acima do input. */}
                <Label htmlFor={idNovo} className="sr-only">
                  Novo empreendimento
                </Label>
                <div className="flex flex-wrap items-start gap-2">
                  <Input
                    id={idNovo}
                    name="nome"
                    placeholder="Ex.: Residencial Jardim das Acácias"
                    maxLength={LIMITE_NOME_EMPREENDIMENTO}
                    className="min-w-0 flex-1"
                    aria-invalid={estado.fieldErrors?.nome ? true : undefined}
                  />
                  <Button type="submit" disabled={pendente}>
                    {pendente ? "Criando..." : "Adicionar"}
                  </Button>
                </div>
                {estado.fieldErrors?.nome && (
                  <p className="text-sm text-destructive">{estado.fieldErrors.nome[0]}</p>
                )}
                {estado.message && (
                  <p
                    role="status"
                    aria-live="polite"
                    className={
                      estado.success
                        ? "text-sm text-muted-foreground"
                        : "text-sm text-destructive"
                    }
                  >
                    {estado.message}
                  </p>
                )}
              </form>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
