"use client";

import { useActionState, useId } from "react";
import { Home, Store } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { TipoImovelLinha } from "@/components/admin/tipos-imovel/TipoImovelLinha";
import { criarTipoImovel } from "@/app/app/tipos-imovel/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { EstadoVazio } from "@/components/admin/ui/EstadoVazio";

// Redesenho de Tipos de Imóvel — Fase 72 migra o CASCO da tela para o
// sistema visual do backoffice (CabecalhoSecao/EstadoVazio), mas o
// conteúdo por dentro do Card (form de criação + TipoImovelLinha) já
// tinha sido redesenhado numa fase anterior e continua exatamente igual:
// o Dialog de confirmação de remoção, o aria-label contextual
// ("Remover tipo de imóvel \"X\"") e o scroll interno (max-h-96) já
// resolviam density e acessibilidade bem — não havia nada para "trocar
// por trocar" ali.
//
// O QUE MUDOU DE VERDADE, e por quê:
//   - CardTitle renderiza um <div> (sem semântica de heading — ver
//     ui/card.tsx). "Imóveis residenciais"/"Imóveis comerciais" NUNCA
//     foram heading nenhum: só o <h1> da página existia como heading
//     real. CabecalhoSecao corrige isso com um <h2> de verdade — achado
//     de acessibilidade, não preferência visual.
//   - o input de criação não tinha NENHUM label associado, só
//     placeholder (que não é substituto de label). Ganhou um <Label
//     sr-only> "Novo tipo de imóvel residencial/comercial" — texto
//     diferente por categoria, porque duas categorias na mesma página
//     com o MESMO nome acessível seriam indistinguíveis por leitor de
//     tela navegando por campo de formulário.
//   - ícone por categoria (Home/Store): não decorativo — é o mesmo sinal
//     visual que já separa os dois grupos no texto, tornando a
//     diferença legível de relance, não só por posição na grade.
const ICONE_POR_CATEGORIA = { RESIDENTIAL: Home, COMMERCIAL: Store } as const;
const ROTULO_CATEGORIA = { RESIDENTIAL: "residencial", COMMERCIAL: "comercial" } as const;

export function TiposImovelGrupoCard({
  titulo,
  categoria,
  opcoes,
  podeGerenciar,
}: {
  titulo: string;
  categoria: "RESIDENTIAL" | "COMMERCIAL";
  opcoes: { id: string; nome: string }[];
  podeGerenciar: boolean;
}) {
  const [estado, formAction, pendente] = useActionState(criarTipoImovel, ESTADO_INICIAL_ACAO);
  const total = opcoes.length;
  const idNovo = useId();
  const Icone = ICONE_POR_CATEGORIA[categoria];
  const rotulo = ROTULO_CATEGORIA[categoria];

  return (
    <section className="min-w-0 space-y-4">
      <CabecalhoSecao
        icone={Icone}
        titulo={titulo}
        descricao={total === 1 ? "1 tipo cadastrado" : `${total} tipos cadastrados`}
      />

      <Card className="min-w-0">
        <CardContent className="min-w-0 space-y-4">
          {podeGerenciar && (
            <div>
              <form action={formAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="categoria" value={categoria} />
                <Label htmlFor={idNovo} className="sr-only">
                  Novo tipo de imóvel {rotulo}
                </Label>
                <Input
                  id={idNovo}
                  name="nome"
                  placeholder="Novo tipo de imóvel"
                  required
                  disabled={pendente}
                  className="min-w-0 flex-1"
                  aria-invalid={!estado.success && estado.fieldErrors?.nome ? true : undefined}
                />
                <Button type="submit" variant="outline" disabled={pendente} className="shrink-0">
                  {pendente ? "Adicionando..." : "Adicionar"}
                </Button>
              </form>
              {!estado.success && (
                <ErroCampo erros={estado.fieldErrors?.nome ?? (estado.message ? [estado.message] : [])} />
              )}
            </div>
          )}

          {opcoes.length === 0 ? (
            // Sem CTA duplicado: quando há permissão, o formulário já
            // está logo acima, no mesmo Card — mesmo princípio já
            // aplicado em Empreendimentos (Fase 71).
            <EstadoVazio icone={Icone} titulo={`Nenhum tipo ${rotulo} cadastrado`} />
          ) : (
            <ul className="max-h-96 space-y-0 overflow-y-auto">
              {opcoes.map((opcao) => (
                <TipoImovelLinha
                  key={opcao.id}
                  id={opcao.id}
                  nome={opcao.nome}
                  podeGerenciar={podeGerenciar}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
