"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { IconeLocalProximo } from "@/components/IconeLocalProximo";
import {
  CATEGORIAS_LOCAL,
  CATEGORIA_LOCAL_LABEL,
  LIMITE_LOCAIS_PROXIMOS,
  LIMITE_NOME_LOCAL,
  UNIDADES_DISTANCIA,
  UNIDADE_DISTANCIA_LABEL,
  distanciaParaCampo,
  interpretarDistancia,
  resumoDoLocal,
  type CategoriaLocal,
  type LocalProximo,
  type UnidadeDistancia,
} from "@/lib/locais-proximos";

// O que tem por perto (Fase 42).
//
// Mesmo contrato dos materiais: a lista vive no cliente e viaja num campo
// escondido em JSON; "Salvar imóvel" é o que persiste. Os ids dos locais
// já salvos vão junto, para a action editar a linha em vez de recriá-la.
//
// Nada aqui é <form>: o editor está DENTRO do formulário do imóvel, então
// todo botão é type="button" e Enter nos campos adiciona/salva o local em
// vez de enviar o imóvel inteiro.

// Mesmas classes do select nativo usado no vínculo de empreendimento:
// aqui o valor (MARKET) difere do rótulo (Mercado), e o Select do Base UI
// mostraria o valor cru.
const CLASSE_SELECT =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive";

type ItemLista = LocalProximo & { chave: string };

type Rascunho = {
  categoria: CategoriaLocal | "";
  nome: string;
  distancia: string;
  unidade: UnidadeDistancia;
};

const RASCUNHO_VAZIO: Rascunho = {
  categoria: "",
  nome: "",
  distancia: "",
  unidade: "METERS",
};

type ErrosRascunho = { categoria?: string; nome?: string; distancia?: string };

function validar(r: Rascunho):
  | { ok: true; local: Omit<LocalProximo, "id"> }
  | { ok: false; erros: ErrosRascunho } {
  const erros: ErrosRascunho = {};
  const nome = r.nome.trim();
  if (!r.categoria) erros.categoria = "Escolha a categoria.";
  if (!nome) erros.nome = "Informe o nome do local.";
  else if (nome.length > LIMITE_NOME_LOCAL) {
    erros.nome = `Use no máximo ${LIMITE_NOME_LOCAL} caracteres.`;
  }
  const d = interpretarDistancia(r.distancia, r.unidade);
  if (!d.ok) erros.distancia = d.erro;
  if (!r.categoria || !d.ok || Object.keys(erros).length > 0) {
    return { ok: false, erros };
  }
  return {
    ok: true,
    local: { categoria: r.categoria, nome, distancia: d.distancia, unidade: d.unidade },
  };
}

/** Enter num campo do editor não pode enviar o formulário do imóvel. */
function aoEnter(acao: () => void) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      acao();
    }
  };
}

function CamposLocal({
  prefixo,
  rascunho,
  erros,
  onChange,
  onEnter,
}: {
  prefixo: string;
  rascunho: Rascunho;
  erros: ErrosRascunho;
  onChange: (r: Rascunho) => void;
  onEnter: () => void;
}) {
  const id = (campo: string) => `${prefixo}-${campo}`;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_minmax(0,12rem)]">
      <div className="min-w-0 space-y-2">
        <Label htmlFor={id("categoria")}>Categoria</Label>
        <select
          id={id("categoria")}
          value={rascunho.categoria}
          aria-invalid={erros.categoria ? true : undefined}
          onChange={(e) =>
            onChange({ ...rascunho, categoria: e.target.value as CategoriaLocal | "" })
          }
          className={CLASSE_SELECT}
        >
          <option value="">Selecione</option>
          {CATEGORIAS_LOCAL.map((c) => (
            <option key={c} value={c}>
              {CATEGORIA_LOCAL_LABEL[c]}
            </option>
          ))}
        </select>
        <ErroCampo erros={erros.categoria ? [erros.categoria] : undefined} />
      </div>

      <div className="min-w-0 space-y-2">
        <Label htmlFor={id("nome")}>Nome do local</Label>
        <Input
          id={id("nome")}
          value={rascunho.nome}
          maxLength={LIMITE_NOME_LOCAL}
          placeholder="Ex.: Supermercado Pão de Açúcar"
          aria-invalid={erros.nome ? true : undefined}
          onChange={(e) => onChange({ ...rascunho, nome: e.target.value })}
          onKeyDown={aoEnter(onEnter)}
        />
        <ErroCampo erros={erros.nome ? [erros.nome] : undefined} />
      </div>

      <div className="min-w-0 space-y-2">
        <Label htmlFor={id("distancia")}>Distância (opcional)</Label>
        <div className="flex min-w-0 gap-2">
          <Input
            id={id("distancia")}
            inputMode="decimal"
            autoComplete="off"
            value={rascunho.distancia}
            placeholder={rascunho.unidade === "METERS" ? "350" : "1,2"}
            aria-invalid={erros.distancia ? true : undefined}
            className="min-w-0 flex-1"
            onChange={(e) => onChange({ ...rascunho, distancia: e.target.value })}
            onKeyDown={aoEnter(onEnter)}
          />
          <select
            id={id("unidade")}
            aria-label="Unidade da distância"
            value={rascunho.unidade}
            onChange={(e) =>
              onChange({ ...rascunho, unidade: e.target.value as UnidadeDistancia })
            }
            className={`${CLASSE_SELECT} w-20 shrink-0`}
          >
            {UNIDADES_DISTANCIA.map((u) => (
              <option key={u} value={u}>
                {UNIDADE_DISTANCIA_LABEL[u]}
              </option>
            ))}
          </select>
        </div>
        <ErroCampo erros={erros.distancia ? [erros.distancia] : undefined} />
      </div>
    </div>
  );
}

function rascunhoDe(local: LocalProximo): Rascunho {
  return {
    categoria: local.categoria,
    nome: local.nome,
    distancia: distanciaParaCampo(local.distancia),
    unidade: local.unidade ?? "METERS",
  };
}

export function LocaisProximosEditor({
  locaisIniciais = [],
  erros,
}: {
  locaisIniciais?: LocalProximo[];
  /** Erros devolvidos pela action ao salvar o imóvel. */
  erros?: string[];
}) {
  const prefixo = useId();
  const proximaChave = useRef(0);
  const novaChave = () => `n${proximaChave.current++}`;

  const [locais, setLocais] = useState<ItemLista[]>(() =>
    locaisIniciais.map((l, i) => ({ ...l, chave: l.id ?? `i${i}` }))
  );
  const [novo, setNovo] = useState<Rascunho>(RASCUNHO_VAZIO);
  const [errosNovo, setErrosNovo] = useState<ErrosRascunho>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [edicao, setEdicao] = useState<Rascunho>(RASCUNHO_VAZIO);
  const [errosEdicao, setErrosEdicao] = useState<ErrosRascunho>({});

  const noLimite = locais.length >= LIMITE_LOCAIS_PROXIMOS;

  function adicionar() {
    if (noLimite) return;
    const r = validar(novo);
    if (!r.ok) {
      setErrosNovo(r.erros);
      return;
    }
    setLocais((atual) => [...atual, { ...r.local, chave: novaChave() }]);
    setNovo(RASCUNHO_VAZIO);
    setErrosNovo({});
  }

  function iniciarEdicao(item: ItemLista) {
    setEditando(item.chave);
    setEdicao(rascunhoDe(item));
    setErrosEdicao({});
  }

  function salvarEdicao() {
    const r = validar(edicao);
    if (!r.ok) {
      setErrosEdicao(r.erros);
      return;
    }
    // O id fica: é o mesmo local, com outros dados.
    setLocais((atual) =>
      atual.map((l) => (l.chave === editando ? { ...l, ...r.local } : l))
    );
    setEditando(null);
  }

  function mover(indice: number, delta: -1 | 1) {
    setLocais((atual) => {
      const destino = indice + delta;
      if (destino < 0 || destino >= atual.length) return atual;
      const copia = [...atual];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
  }

  function remover(chave: string) {
    setLocais((atual) => atual.filter((l) => l.chave !== chave));
    if (editando === chave) setEditando(null);
  }

  const json = JSON.stringify(
    locais.map(({ id, categoria, nome, distancia, unidade }) => ({
      ...(id ? { id } : {}),
      categoria,
      nome,
      distancia,
      unidade,
    }))
  );

  return (
    <div className="min-w-0 space-y-6" data-testid="editor-locais-proximos">
      <input type="hidden" name="locaisProximosJson" value={json} />

      <div className="min-w-0 space-y-4">
        <CamposLocal
          prefixo={`${prefixo}-novo`}
          rascunho={novo}
          erros={errosNovo}
          onChange={setNovo}
          onEnter={adicionar}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            type="button"
            variant="outline"
            onClick={adicionar}
            disabled={noLimite}
            className="w-full sm:w-auto"
          >
            Adicionar local
          </Button>
          {noLimite && (
            <p className="text-xs text-muted-foreground">
              Limite de {LIMITE_LOCAIS_PROXIMOS} locais por imóvel.
            </p>
          )}
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <h3 className="text-sm font-medium">Locais cadastrados</h3>
        {locais.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum local cadastrado. A seção não aparece no site enquanto a lista estiver vazia.
          </p>
        ) : (
          <ul className="min-w-0 divide-y border-y" aria-label="Locais cadastrados">
            {locais.map((local, indice) => (
              <li
                key={local.chave}
                data-testid="local-proximo"
                className="min-w-0 py-3"
              >
                {editando === local.chave ? (
                  <div className="min-w-0 space-y-4">
                    <CamposLocal
                      prefixo={`${prefixo}-${local.chave}`}
                      rascunho={edicao}
                      erros={errosEdicao}
                      onChange={setEdicao}
                      onEnter={salvarEdicao}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={salvarEdicao}>
                        Salvar local
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditando(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                    <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <IconeLocalProximo categoria={local.categoria} className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{local.nome}</p>
                        <p className="text-xs text-muted-foreground break-words">
                          {resumoDoLocal(local)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => iniciarEdicao(local)}
                        aria-label={`Editar local ${local.nome}`}
                      >
                        <Pencil aria-hidden="true" />
                        Editar
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => mover(indice, -1)}
                        disabled={indice === 0}
                        aria-label={`Mover ${local.nome} para cima`}
                      >
                        <ChevronUp aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        onClick={() => mover(indice, 1)}
                        disabled={indice === locais.length - 1}
                        aria-label={`Mover ${local.nome} para baixo`}
                      >
                        <ChevronDown aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => remover(local.chave)}
                        aria-label={`Remover local ${local.nome}`}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 aria-hidden="true" />
                        Remover
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <ErroCampo erros={erros} />
        <p className="text-xs text-muted-foreground">
          As alterações valem quando você salvar o imóvel.
        </p>
      </div>
    </div>
  );
}
