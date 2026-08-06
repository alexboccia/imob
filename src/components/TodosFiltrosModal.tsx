"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { normalizarTexto } from "@/lib/texto";
import { FaixaDupla } from "@/components/FaixaDupla";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconeBusca, IconeFiltros, IconeFechar } from "@/components/icons";
import type { TipoComCategoria } from "@/lib/filtros-imoveis-data";

const QUANTIDADE_INICIAL = 8;
const NUMEROS = ["1", "2", "3", "4", "5"];

function Chip({
  ativo,
  onClick,
  children,
  className = "",
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
        ativo
          ? "bg-black text-white border-black"
          : "border-gray-300 text-gray-700 hover:border-gray-400"
      } ${className}`}
    >
      {children}
    </button>
  );
}

function SecaoTitulo({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-semibold text-base mb-3 pb-3 border-b">{children}</h3>
  );
}

function opcoesVisiveis(
  opcoes: string[],
  selecionados: string[],
  busca: string,
  mostrarTodas: boolean
) {
  const buscaNormalizada = normalizarTexto(busca.trim());
  if (buscaNormalizada) {
    return opcoes.filter((opcao) =>
      normalizarTexto(opcao).includes(buscaNormalizada)
    );
  }
  if (mostrarTodas) return opcoes;
  const selecionadosPrimeiro = opcoes.filter((o) => selecionados.includes(o));
  const restantes = opcoes.filter((o) => !selecionados.includes(o));
  return [...selecionadosPrimeiro, ...restantes].slice(
    0,
    Math.max(QUANTIDADE_INICIAL, selecionadosPrimeiro.length)
  );
}

export function TodosFiltrosModal({
  tipos,
  bairros,
  caracteristicas,
}: {
  tipos: TipoComCategoria[];
  bairros: string[];
  caracteristicas: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const [busca, setBusca] = useState("");
  const [transacao, setTransacao] = useState("");
  const [categoriaTipo, setCategoriaTipo] = useState("");
  const [tipoSelecionado, setTipoSelecionado] = useState<string[]>([]);
  const [bairroSelecionado, setBairroSelecionado] = useState<string[]>([]);
  const [buscaBairro, setBuscaBairro] = useState("");
  const [mostrarTodosBairros, setMostrarTodosBairros] = useState(false);
  const [dormitorios, setDormitorios] = useState("");
  const [suites, setSuites] = useState("");
  const [vagas, setVagas] = useState("");
  const [precoMin, setPrecoMin] = useState("");
  const [precoMax, setPrecoMax] = useState("");
  const [areaMin, setAreaMin] = useState("");
  const [areaMax, setAreaMax] = useState("");
  const [caractSelecionadas, setCaractSelecionadas] = useState<string[]>([]);
  const [buscaCaract, setBuscaCaract] = useState("");
  const [mostrarTodasCaract, setMostrarTodasCaract] = useState(false);

  function alternarLista(
    lista: string[],
    setLista: (v: string[]) => void,
    valor: string
  ) {
    setLista(
      lista.includes(valor)
        ? lista.filter((v) => v !== valor)
        : [...lista, valor]
    );
  }

  function alternarUnico(
    atual: string,
    setAtual: (v: string) => void,
    valor: string
  ) {
    setAtual(atual === valor ? "" : valor);
  }

  function limparFiltros() {
    setBusca("");
    setTransacao("");
    setCategoriaTipo("");
    setTipoSelecionado([]);
    setBairroSelecionado([]);
    setBuscaBairro("");
    setMostrarTodosBairros(false);
    setDormitorios("");
    setSuites("");
    setVagas("");
    setPrecoMin("");
    setPrecoMax("");
    setAreaMin("");
    setAreaMax("");
    setCaractSelecionadas([]);
    setBuscaCaract("");
    setMostrarTodasCaract(false);
  }

  function buscar() {
    const query = new URLSearchParams();
    if (busca) query.set("busca", busca);
    if (transacao) query.set("finalidade", transacao);
    if (categoriaTipo) query.set("categoriaTipo", categoriaTipo);
    tipoSelecionado.forEach((t) => query.append("tipo", t));
    bairroSelecionado.forEach((b) => query.append("bairro", b));
    if (dormitorios) query.set("quartos", dormitorios);
    if (suites) query.set("suites", suites);
    if (vagas) query.set("vagas", vagas);
    if (precoMin) query.set("precoMin", precoMin);
    if (precoMax) query.set("precoMax", precoMax);
    if (areaMin) query.set("areaMin", areaMin);
    if (areaMax) query.set("areaMax", areaMax);
    caractSelecionadas.forEach((c) => query.append("caracteristicas", c));
    setOpen(false);
    router.push(`/imoveis?${query.toString()}`);
  }

  const tiposFiltrados = categoriaTipo
    ? tipos.filter((t) => t.categoria === categoriaTipo || t.categoria === null)
    : tipos;

  const bairrosVisiveis = opcoesVisiveis(
    bairros,
    bairroSelecionado,
    buscaBairro,
    mostrarTodosBairros
  );
  const restantesBairros = bairros.length - bairrosVisiveis.length;
  const buscaBairroNormalizada = normalizarTexto(buscaBairro.trim());

  const caractVisiveis = opcoesVisiveis(
    caracteristicas,
    caractSelecionadas,
    buscaCaract,
    mostrarTodasCaract
  );
  const restantesCaract = caracteristicas.length - caractVisiveis.length;
  const buscaCaractNormalizada = normalizarTexto(buscaCaract.trim());

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="lg" className="shrink-0" />
        }
      >
        <IconeFiltros className="w-4 h-4" />
        Ver todos os filtros
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col gap-0 p-0 sm:max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <DialogTitle className="text-xl font-semibold">
            Todos os filtros
          </DialogTitle>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div className="flex gap-2">
            <div className="flex flex-1 rounded-md overflow-hidden border bg-gray-50">
              <Input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Código, bairro ou empreendimento"
                className="flex-1 rounded-none border-0 bg-transparent shadow-none"
              />
            </div>
            <Button onClick={buscar}>
              <IconeBusca className="w-4 h-4" />
              Buscar
            </Button>
          </div>

          <div>
            <SecaoTitulo>Localização</SecaoTitulo>
            <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
              Em qual localização?
            </p>
            <Input
              type="text"
              value={buscaBairro}
              onChange={(e) => setBuscaBairro(e.target.value)}
              placeholder="Digite o bairro..."
              className="mb-3 bg-gray-50"
            />
            {bairros.length === 0 ? (
              <p className="text-xs text-gray-500">
                Nenhuma localização cadastrada.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {bairrosVisiveis.map((b) => (
                  <Chip
                    key={b}
                    ativo={bairroSelecionado.includes(b)}
                    onClick={() =>
                      alternarLista(bairroSelecionado, setBairroSelecionado, b)
                    }
                  >
                    {b}
                  </Chip>
                ))}
              </div>
            )}
            {!buscaBairroNormalizada && restantesBairros > 0 && (
              <button
                type="button"
                onClick={() => setMostrarTodosBairros(true)}
                className="mt-3 text-sm text-blue-600 hover:underline block"
              >
                Ver as outras {restantesBairros} localizações
              </button>
            )}
          </div>

          <div>
            <SecaoTitulo>Tipo de negócio</SecaoTitulo>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-medium mb-2">Transação</p>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    ativo={transacao === "VENDA"}
                    onClick={() => alternarUnico(transacao, setTransacao, "VENDA")}
                  >
                    Comprar
                  </Chip>
                  <Chip
                    ativo={transacao === "ALUGUEL"}
                    onClick={() =>
                      alternarUnico(transacao, setTransacao, "ALUGUEL")
                    }
                  >
                    Alugar
                  </Chip>
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Finalidade</p>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    ativo={categoriaTipo === "RESIDENCIAL"}
                    onClick={() =>
                      alternarUnico(categoriaTipo, setCategoriaTipo, "RESIDENCIAL")
                    }
                  >
                    Residencial
                  </Chip>
                  <Chip
                    ativo={categoriaTipo === "COMERCIAL"}
                    onClick={() =>
                      alternarUnico(categoriaTipo, setCategoriaTipo, "COMERCIAL")
                    }
                  >
                    Comercial
                  </Chip>
                </div>
              </div>
            </div>
          </div>

          {tiposFiltrados.length > 0 && (
            <div>
              <SecaoTitulo>Tipo de imóvel</SecaoTitulo>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {tiposFiltrados.map((t) => (
                  <Chip
                    key={t.nome}
                    ativo={tipoSelecionado.includes(t.nome)}
                    onClick={() =>
                      alternarLista(tipoSelecionado, setTipoSelecionado, t.nome)
                    }
                    className="justify-center text-center"
                  >
                    {t.nome}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          <div>
            <SecaoTitulo>Características</SecaoTitulo>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium mb-2">
                  Dormitórios{" "}
                  <span className="text-gray-400 font-normal">(a partir de)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {NUMEROS.map((n) => (
                    <Chip
                      key={n}
                      ativo={dormitorios === n}
                      onClick={() => alternarUnico(dormitorios, setDormitorios, n)}
                      className="w-9 justify-center px-0"
                    >
                      {n}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">
                  Suítes{" "}
                  <span className="text-gray-400 font-normal">(a partir de)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {NUMEROS.map((n) => (
                    <Chip
                      key={n}
                      ativo={suites === n}
                      onClick={() => alternarUnico(suites, setSuites, n)}
                      className="w-9 justify-center px-0"
                    >
                      {n}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">
                  Vagas{" "}
                  <span className="text-gray-400 font-normal">(a partir de)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {NUMEROS.map((n) => (
                    <Chip
                      key={n}
                      ativo={vagas === n}
                      onClick={() => alternarUnico(vagas, setVagas, n)}
                      className="w-9 justify-center px-0"
                    >
                      {n}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <SecaoTitulo>Faixa de valor</SecaoTitulo>
            <FaixaDupla
              titulo="Faixa de preço (R$)"
              min={0}
              max={5000000}
              step={10000}
              valorMin={precoMin}
              valorMax={precoMax}
              onChangeMin={setPrecoMin}
              onChangeMax={setPrecoMax}
              labelMin="Valor mínimo"
              labelMax="Valor máximo"
            />
          </div>

          <div>
            <SecaoTitulo>Metragem</SecaoTitulo>
            <FaixaDupla
              titulo="Faixa de área (m²)"
              min={0}
              max={1000}
              step={10}
              valorMin={areaMin}
              valorMax={areaMax}
              onChangeMin={setAreaMin}
              onChangeMax={setAreaMax}
              labelMin="Mínimo (m²)"
              labelMax="Máximo (m²)"
            />
          </div>

          {caracteristicas.length > 0 && (
            <div>
              <SecaoTitulo>Comodidades</SecaoTitulo>
              <Input
                type="text"
                value={buscaCaract}
                onChange={(e) => setBuscaCaract(e.target.value)}
                placeholder="Buscar característica..."
                className="mb-3 bg-gray-50"
              />
              <div className="flex flex-wrap gap-2">
                {caractVisiveis.map((c) => (
                  <Chip
                    key={c}
                    ativo={caractSelecionadas.includes(c)}
                    onClick={() =>
                      alternarLista(caractSelecionadas, setCaractSelecionadas, c)
                    }
                  >
                    {c}
                  </Chip>
                ))}
              </div>
              {!buscaCaractNormalizada && restantesCaract > 0 && (
                <button
                  type="button"
                  onClick={() => setMostrarTodasCaract(true)}
                  className="mt-3 text-sm text-blue-600 hover:underline block"
                >
                  Ver as outras {restantesCaract} características
                </button>
              )}
              {caractSelecionadas.length > 0 && (
                <div className="border-t mt-4 pt-3">
                  <p className="text-xs font-semibold text-gray-500 mb-2">
                    Selecionados
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {caractSelecionadas.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 bg-gray-100 text-gray-800 text-xs rounded-full pl-3 pr-2 py-1"
                      >
                        {s}
                        <button
                          type="button"
                          onClick={() =>
                            alternarLista(
                              caractSelecionadas,
                              setCaractSelecionadas,
                              s
                            )
                          }
                          aria-label={`Remover ${s}`}
                          className="hover:text-black"
                        >
                          <IconeFechar className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-background">
          <Button variant="outline" onClick={limparFiltros}>
            Limpar filtros
          </Button>
          <Button onClick={buscar}>Buscar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
