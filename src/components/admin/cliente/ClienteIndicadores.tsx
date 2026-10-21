import { Home, Star, Calendar } from "lucide-react";

// Redesenho da ficha do cliente — Fase 128.1 (fidelidade visual ao
// protótipo aprovado): os 3 KPIs ao lado do cartão de identificação.
// Conteúdo ALINHADO À ESQUERDA (ícone, depois valor, depois legenda,
// cada um na sua própria linha) — diferente da primeira versão
// (centralizada, mais estreita), que fazia a legenda quebrar em várias
// linhas e a data de "Última interação" vazar para uma segunda linha.
// Todos os 3 números vêm de dados já carregados pela página — nenhuma
// contagem é aproximada ou fabricada.
//
// Achado real: o valor de "Última interação" ("19/10/2026", bem mais
// largo que um contador de 1 dígito) vazava do card quando o tile tinha
// só 140px de largura mínima — a correção certa é dar espaço ao tile
// (min-w maior), não diminuir a fonte da data: os 3 valores precisam do
// MESMO tamanho/alinhamento entre si, por pedido explícito.
function Indicador({
  icone: Icone,
  tom,
  valor,
  rotulo,
  titulo,
}: {
  icone: typeof Home;
  tom: "azul" | "laranja";
  valor: number | string;
  rotulo: string;
  /** Tooltip nativo — usado pela "Última interação" pra guardar a HORA
      exata (o valor principal mostra só a data, numa linha só). */
  titulo?: string;
}) {
  return (
    <div
      title={titulo}
      className="flex min-w-[168px] flex-1 flex-col items-start gap-2 rounded-2xl border border-border bg-background px-4 py-4"
    >
      <span
        className={
          "flex size-9 items-center justify-center rounded-lg " +
          (tom === "azul" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700")
        }
      >
        <Icone className="size-4.5" aria-hidden />
      </span>
      <p className="whitespace-nowrap text-2xl leading-tight font-bold tabular-nums">{valor}</p>
      <p className="text-sm leading-tight text-muted-foreground">{rotulo}</p>
    </div>
  );
}

export function ClienteIndicadores({
  totalRelacionados,
  totalRecomendados,
  ultimaInteracaoData,
  ultimaInteracaoDataHoraCompleta,
}: {
  totalRelacionados: number;
  totalRecomendados: number;
  /** Só a data (DD/MM/AAAA) — cabe numa linha só mesmo no card mais estreito. */
  ultimaInteracaoData: string | null;
  /** Data + hora — vai só no tooltip, nunca no valor principal do card. */
  ultimaInteracaoDataHoraCompleta: string | null;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <Indicador icone={Home} tom="azul" valor={totalRelacionados} rotulo="Imóveis relacionados" />
      <Indicador icone={Star} tom="laranja" valor={totalRecomendados} rotulo="Imóveis recomendados" />
      <Indicador
        icone={Calendar}
        tom="azul"
        valor={ultimaInteracaoData ?? "—"}
        rotulo="Última interação"
        titulo={ultimaInteracaoDataHoraCompleta ?? undefined}
      />
    </div>
  );
}
