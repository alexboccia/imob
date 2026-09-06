"use client";

import { useActionState, useId } from "react";
import { atualizarEstagioInteresse } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { ESTAGIOS_INTERESSE, ESTAGIO_INTERESSE_LABEL } from "@/lib/property-interest-schema";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { PropertyInterestStage } from "@/generated/prisma/client";

// Controle de movimentação do Kanban (Fase P.4) — reaproveita
// atualizarEstagioInteresse (Fase D) sem nenhuma regra nova: mesma action,
// mesmo Zod que já restringe aos 4 stages abertos (WON/REJECTED
// continuam impossíveis de alcançar por aqui, defesa real no schema, não
// só a UI escondendo opção). V1 deliberadamente SEM drag-and-drop —
// Select + botão é 100% acessível por teclado/leitor de tela sem
// depender de nenhuma biblioteca nova (ver AGENTS.md da P.4: "prefira uma
// V1 simples e robusta").
export function MoverEstagioPipeline({
  interesseId,
  stageAtual,
}: {
  interesseId: string;
  stageAtual: PropertyInterestStage;
}) {
  const acao = atualizarEstagioInteresse.bind(null, interesseId);
  const [estado, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);
  const selectId = useId();

  return (
    // flex-wrap (não nowrap) + Select com min-w-0/flex-1: em coluna estreita
    // (mobile — ver seção 16 da P.4), o trigger encolhe pra caber no
    // espaço disponível em vez de manter uma largura fixa que forçava
    // overflow horizontal da PÁGINA inteira (achado do smoke local); se
    // mesmo assim não couber ao lado do botão, quebra pra próxima linha
    // DENTRO do card, nunca empurra a página.
    // `relative` NÃO é decorativo: o <Label> abaixo é `sr-only`, e o
    // sr-only do Tailwind é `position:absolute` SEM left/top — o elemento
    // fica na sua posição estática. Sem um ancestral posicionado, o bloco
    // contêiner dele passa a ser o bloco contêiner inicial (o documento),
    // e como este card vive dentro do board do Kanban com scroll
    // horizontal, a posição estática cai FORA da viewport: o label
    // escapava do `overflow-x:auto` do board e esticava a rolagem
    // horizontal do DOCUMENTO em ~100px a partir de 768px (medido:
    // window.scrollX chegava a 100). Com `relative`, o contêiner passa a
    // ser este form, dentro do card `overflow-hidden`, e nada vaza.
    <form action={formAction} className="relative flex flex-wrap items-center gap-1.5">
      <Label htmlFor={selectId} className="sr-only">
        Mover para outra etapa
      </Label>
      {/* key={stageAtual}: mesmo racional de InteresseImovelItem.tsx —
          remonta o Select quando o stage muda por outra via (ex: o
          próprio submit deste form), sem isso o defaultValue de um
          Select uncontrolled não acompanha sozinho. */}
      <Select key={stageAtual} name="stage" defaultValue={stageAtual}>
        <SelectTrigger id={selectId} size="sm" className="min-w-0 flex-1 max-w-[150px]">
          {/* SelectValue sem `items` no Select.Root (não usado neste
              projeto) resolve o rótulo exibido no trigger FECHADO a
              partir do valor cru, não dos children de SelectItem —
              achado pré-existente (mesmo padrão em InteresseImovelItem.tsx,
              fora de escopo da P.4, documentado no relatório final). Aqui,
              onde o Select PRECISA ser legível pro corretor decidir a
              movimentação, resolvido via a própria API documentada do
              base-ui (children como função `(value) => ReactNode`). */}
          <SelectValue>{(valor: string) => ESTAGIO_INTERESSE_LABEL[valor] ?? valor}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {ESTAGIOS_INTERESSE.map((valor) => (
            <SelectItem key={valor} value={valor}>
              {ESTAGIO_INTERESSE_LABEL[valor]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? "Movendo..." : "Mover"}
      </Button>
      {estado.message && !estado.success && (
        <p className="text-xs text-destructive w-full basis-full">{estado.message}</p>
      )}
    </form>
  );
}
