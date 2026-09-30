"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, Building2, User, MessageSquarePlus, UserSearch } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EstadoVazio } from "@/components/admin/ui/EstadoVazio";
import { formatarPreco, formatarCodigoImovel, FINALIDADE_LABEL } from "@/lib/format";
import { MINIMO_CARACTERES_BUSCA, type ResultadoBuscaGlobal } from "@/lib/busca-global-tipos";

// Busca global (Fase 86) — navegação, não uma segunda listagem: encontra
// rapidamente um cliente ou imóvel já conhecido e leva direto à ficha
// real (/app/clientes/[id], /app/imoveis/[id]). Nenhum dado é exibido
// aqui além do que /app/clientes e /app/imoveis já mostrariam ao mesmo
// usuário — a query em src/lib/busca-global.ts reusa
// construirWhereClientes/construirWhereImoveis (mesma normalização,
// mesmo escopo comercial, mesmo portão de módulo CRM) em vez de
// reimplementar a regra de segurança aqui.
//
// DOIS pontos de entrada renderizam este MESMO componente (sidebar
// desktop e cabeçalho mobile) — cada um com seu próprio estado local,
// mesmo padrão de responsividade já usado por AdminSidebarNav/
// AdminMobileNav (dois componentes independentes, nunca os dois visíveis
// ao mesmo tempo por CSS). `capturaAtalho` liga o atalho de teclado
// SÓ na instância desktop: um atalho puramente decorativo na instância
// escondida por `md:hidden` não teria como ser acionado por teclado
// físico (mobile não tem), e registrar o listener nas duas dobraria o
// risco de abrir dois diálogos ao mesmo tempo.
const DEBOUNCE_MS = 400;

export function BuscaGlobal({
  capturaAtalho = false,
  variant = "desktop",
}: {
  capturaAtalho?: boolean;
  variant?: "desktop" | "mobile";
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<ResultadoBuscaGlobal | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Atalho global Cmd/Ctrl+K — só na instância que recebeu `capturaAtalho`.
  // Não intercepta digitação normal: exige a tecla modificadora, então
  // nunca rouba "k" de um campo de texto comum. Mesmo assim, ignora
  // quando o foco já está num campo de texto E nenhum modificador foi
  // pressionado junto — defesa redundante, nunca a única.
  useEffect(() => {
    if (!capturaAtalho) return;
    function aoTeclar(evento: KeyboardEvent) {
      const combinacao = (evento.metaKey || evento.ctrlKey) && evento.key.toLowerCase() === "k";
      if (!combinacao) return;
      evento.preventDefault();
      setAberto((atual) => !atual);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [capturaAtalho]);

  // Debounce (mesmos 400ms de TableSearchInput.tsx, convenção já
  // estabelecida no projeto para busca em listagem) — uma chamada de
  // rede por pausa de digitação, nunca por tecla.
  useEffect(() => {
    // Termo curto demais: nada a buscar. O render já ignora
    // `resultado`/`carregando`/`erro` nesse caso (via `semTermoSuficiente`
    // abaixo), então não há estado pra limpar aqui — só não disparar
    // a busca.
    if (!aberto || termo.trim().length < MINIMO_CARACTERES_BUSCA) return;
    let cancelado = false;
    const timer = setTimeout(() => {
      if (cancelado) return;
      setCarregando(true);
      setErro(false);
      fetch(`/api/admin/busca-global?q=${encodeURIComponent(termo)}`)
        .then((r) => {
          if (!r.ok) throw new Error("busca falhou");
          return r.json();
        })
        .then((dados: ResultadoBuscaGlobal) => {
          if (!cancelado) {
            setResultado(dados);
            setCarregando(false);
          }
        })
        .catch(() => {
          if (!cancelado) {
            setErro(true);
            setCarregando(false);
          }
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [termo, aberto]);

  function fechar() {
    setAberto(false);
    setTermo("");
    setResultado(null);
    setErro(false);
  }

  const semTermoSuficiente = termo.trim().length < MINIMO_CARACTERES_BUSCA;
  const semResultados =
    !semTermoSuficiente &&
    !carregando &&
    !erro &&
    resultado &&
    resultado.clientes.length === 0 &&
    resultado.imoveis.length === 0;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(valor) => (valor ? setAberto(true) : fechar())}
    >
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size={variant === "mobile" ? "icon" : "sm"}
            className={
              variant === "mobile"
                ? undefined
                : "w-full justify-start gap-2 text-muted-foreground font-normal"
            }
            // Nome acessível DISTINTO do texto visível (que continua
            // "Buscar cliente ou imóvel" no título do diálogo, abaixo):
            // "Imóvel" e "Cliente" já são nomes acessíveis de campos reais
            // em várias telas (ex: o combobox "Imóvel" de Relacionar
            // imóvel) — getByLabel/getByRole por substring casaria com
            // este botão à toa. "Busca global" não colide com nada.
            aria-label="Busca global"
          />
        }
      >
        <Search aria-hidden className="size-4 shrink-0" />
        {variant === "desktop" && (
          <>
            <span className="flex-1 text-left">Buscar...</span>
            <span className="text-xs text-muted-foreground/70">⌘K</span>
          </>
        )}
      </DialogTrigger>
      <DialogContent
        className="top-[20%] max-w-[calc(100%-2rem)] translate-y-0 sm:max-w-lg"
        // Foco inicial no campo de busca, não no botão de fechar — é o
        // que a pessoa vai usar no mesmo instante em que o diálogo abre.
        initialFocus={inputRef}
      >
        <DialogHeader>
          <DialogTitle>Buscar cliente ou imóvel</DialogTitle>
          <DialogDescription className="sr-only">
            Digite ao menos {MINIMO_CARACTERES_BUSCA} caracteres para buscar por nome, telefone,
            e-mail, título, código, cidade ou bairro.
          </DialogDescription>
        </DialogHeader>

        <Input
          ref={inputRef}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Nome, telefone, e-mail, título, código..."
          aria-label="Termo de busca"
        />

        <div className="max-h-[60vh] min-w-0 space-y-4 overflow-y-auto">
          {semTermoSuficiente && (
            <p className="text-sm text-muted-foreground">
              Digite ao menos {MINIMO_CARACTERES_BUSCA} caracteres para buscar.
            </p>
          )}

          {!semTermoSuficiente && carregando && (
            <p className="text-sm text-muted-foreground">Buscando...</p>
          )}

          {!semTermoSuficiente && !carregando && erro && (
            <p className="text-sm text-destructive">
              Não foi possível buscar agora. Tente novamente.
            </p>
          )}

          {semResultados && (
            <EstadoVazio
              icone={Search}
              titulo="Nenhum resultado"
              descricao={`Nada encontrado para "${termo}".`}
            />
          )}

          {!semTermoSuficiente && !carregando && !erro && resultado && (
            <>
              {resultado.clientes.length > 0 && (
                <section className="min-w-0">
                  <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Clientes</h3>
                  <ul className="space-y-1">
                    {resultado.clientes.map((cliente) => (
                      <li key={cliente.id} className="flex min-w-0 items-center gap-1">
                        <Link
                          href={`/app/clientes/${cliente.id}`}
                          onClick={fechar}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-2 text-sm hover:bg-muted"
                        >
                          <User aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{cliente.name}</span>
                            {(cliente.phone || cliente.email) && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {[cliente.phone, cliente.email].filter(Boolean).join(" · ")}
                              </span>
                            )}
                          </span>
                        </Link>
                        {/* Fase 87 — atalho de navegação (âncora, nunca um
                            formulário aqui dentro): medição real mostrou
                            ~2 telas de rolagem até "Registrar nova
                            interação" mesmo num cliente recém-criado. O
                            link principal (nome) continua levando ao topo
                            da ficha, como sempre — este é um SEGUNDO link
                            irmão, nunca aninhado dentro do primeiro. */}
                        <Link
                          href={`/app/clientes/${cliente.id}#registrar-interacao`}
                          onClick={fechar}
                          aria-label={`Registrar interação com ${cliente.name}`}
                          title="Registrar interação"
                          className="flex shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <MessageSquarePlus aria-hidden className="size-4" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {resultado.imoveis.length > 0 && (
                <section className="min-w-0">
                  <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">Imóveis</h3>
                  <ul className="space-y-1">
                    {resultado.imoveis.map((imovel) => (
                      <li key={imovel.id} className="flex min-w-0 items-center gap-1">
                        <Link
                          href={`/app/imoveis/${imovel.id}`}
                          onClick={fechar}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-2 text-sm hover:bg-muted"
                        >
                          <Building2 aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {imovel.title}{" "}
                              <span className="font-normal text-muted-foreground">
                                ({formatarCodigoImovel(imovel.code)})
                              </span>
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {imovel.city} · {FINALIDADE_LABEL[imovel.purpose] ?? imovel.purpose} ·{" "}
                              {formatarPreco(imovel.price ?? imovel.rentPrice)}
                            </span>
                          </span>
                        </Link>
                        {/* Fase 87 — mesma ideia do lado do cliente:
                            medição real mostrou 5,6-8,8 TELAS de rolagem
                            até "Clientes compatíveis" num imóvel recém-
                            criado (o formulário de cadastro inteiro vem
                            antes). Segundo link IRMÃO, nunca aninhado.
                            Só quando o CRM está habilitado: sem o módulo
                            a seção nem existe na ficha, e o âncora não
                            teria pra onde rolar. */}
                        {resultado.crmHabilitado && (
                          <Link
                            href={`/app/imoveis/${imovel.id}#clientes-compativeis`}
                            onClick={fechar}
                            aria-label={`Ver clientes compatíveis com ${imovel.title}`}
                            title="Ver clientes"
                            className="flex shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <UserSearch aria-hidden className="size-4" />
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
