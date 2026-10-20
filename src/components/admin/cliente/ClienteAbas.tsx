"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTab, TabsPanel } from "@/components/ui/tabs";
import { ABAS_CLIENTE, abaClienteValida, type AbaCliente } from "@/lib/cliente-abas";
import { AbaClienteProvider } from "@/components/admin/cliente/AbaClienteContext";

// Redesenho da ficha do cliente — controlador client das 4 abas.
//
// Reflete a aba ativa na URL (?aba=) via history.replaceState, NUNCA via
// o router do Next: router.push/replace para uma URL com searchParams
// diferentes dispara uma nova renderização do Server Component da
// página (searchParams é prop dela), o que refaria toda a busca da
// ficha a cada troca de aba — exatamente o carregamento simultâneo que
// a autorização pediu para evitar. history.replaceState muda a URL
// (link copiável, voltar no histórico) sem nenhuma requisição.
//
// TabsPanel (Base UI) desmonta o conteúdo inativo por padrão
// (keepMounted=false) — é o que garante que só a aba ativa tem seu DOM
// pesado montado por vez; os dados de TODAS as abas já vieram numa única
// leitura no servidor (como a ficha sempre fez), isto só evita montar
// formulários/listas grandes das abas que não estão na tela.
export function ClienteAbas({
  abaInicial,
  visaoGeral,
  preferencias,
  imoveis,
  historico,
}: {
  abaInicial: string | undefined;
  visaoGeral: React.ReactNode;
  preferencias: React.ReactNode;
  imoveis: React.ReactNode;
  historico: React.ReactNode;
}) {
  const [aba, setAba] = useState<AbaCliente>(() => abaClienteValida(abaInicial));

  function mudarAba(valor: AbaCliente) {
    setAba(valor);
    const url = new URL(window.location.href);
    if (valor === "visao-geral") url.searchParams.delete("aba");
    else url.searchParams.set("aba", valor);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  return (
    <AbaClienteProvider irPara={mudarAba}>
      <Tabs value={aba} onValueChange={(valor) => mudarAba(valor as AbaCliente)}>
        <TabsList aria-label="Seções da ficha do cliente">
          {ABAS_CLIENTE.map((item) => (
            <TabsTab key={item.valor} value={item.valor}>
              <item.icone className="size-4" aria-hidden />
              {item.rotulo}
            </TabsTab>
          ))}
        </TabsList>
        <div className="pt-6">
          {/* Renderização condicional explícita, em vez de confiar no
              unmount automático do TabsPanel: sem nenhuma transição CSS
              configurada neste wrapper, o hook interno de transição do
              Base UI (useTransitionStatus) nunca completa e o painel
              anterior fica "mounted" para sempre — achado real, visto
              na homologação (duas seções de mesmo nome respondendo ao
              mesmo heading). O papel ARIA (aria-labelledby/tabpanel) do
              Tab correspondente não depende do painel estar montado. */}
          {aba === "visao-geral" && <TabsPanel value="visao-geral">{visaoGeral}</TabsPanel>}
          {aba === "preferencias" && <TabsPanel value="preferencias">{preferencias}</TabsPanel>}
          {aba === "imoveis" && <TabsPanel value="imoveis">{imoveis}</TabsPanel>}
          {aba === "historico" && <TabsPanel value="historico">{historico}</TabsPanel>}
        </div>
      </Tabs>
    </AbaClienteProvider>
  );
}
