import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LinhaCompromisso,
  TituloBloco,
  VerTodos,
} from "@/components/admin/CentralTrabalho";
import type { CompromissoCentral } from "@/lib/central-trabalho";

// Compromissos atrasados — extraído da Central na Fase 65.
//
// POR QUE SAIU DE DENTRO DA CentralTrabalho: a seção "O que precisa da sua
// atenção" põe "Novos contatos" (área maior) ao lado de "Atrasadas" (área
// secundária). Enquanto o bloco vivia dentro do grid da Central, ele não
// podia ser composto ao lado de um componente irmão da página. O conteúdo
// veio verbatim — mesmos dados, mesma ordem (mais antigo primeiro), mesmo
// "Ver todos", mesmo link para a Agenda.
//
// TRATAMENTO DE ATENÇÃO, NÃO DE ERRO: borda e fundo âmbar bem suaves e um
// ícone — o card inteiro NÃO é pintado de cor saturada. Atraso é algo a
// resolver, não uma falha do sistema, e um alerta diário em vermelho forte
// deixa de ser lido depois da primeira semana.
//
// O estado nunca depende só de cor: o badge diz em texto quantos
// compromissos estão em aberto.
export function CompromissosAtrasados({
  atrasadas,
  fuso,
}: {
  atrasadas: { total: number; itens: CompromissoCentral[] };
  fuso: string;
}) {
  // Só aparece quando existe — um card vazio de "nenhum atraso" seria
  // ruído diário.
  if (atrasadas.total === 0) return null;

  return (
    <Card
      data-compromissos-atrasados
      className="min-w-0 border-orange-200 bg-orange-50/40"
    >
      <CardHeader>
        <TituloBloco>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-orange-100 text-orange-700">
            <AlertTriangle aria-hidden className="size-3.5" />
          </span>
          Atrasadas
          {/* Texto junto do número: o estado não depende só de cor. */}
          <Badge variant="outline" className="border-orange-300 text-orange-700">
            {atrasadas.total}{" "}
            {atrasadas.total === 1 ? "compromisso em aberto" : "compromissos em aberto"}
          </Badge>
        </TituloBloco>
        <p className="pt-1 text-sm text-muted-foreground">
          Compromissos cujo dia já passou e que continuam sem conclusão. Mais antigo
          primeiro.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="text-sm">
          {atrasadas.itens.map((c) => (
            <LinhaCompromisso key={c.id} compromisso={c} mostrarDia fuso={fuso} />
          ))}
        </ul>
        <VerTodos href="/app/agenda" total={atrasadas.total} exibidos={atrasadas.itens.length} />
      </CardContent>
    </Card>
  );
}
