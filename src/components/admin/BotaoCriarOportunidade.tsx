"use client";

import { useActionState } from "react";
import { criarOportunidadeDoContato } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Button } from "@/components/ui/button";

// Converte um contato do site em oportunidade, preservando a origem
// (Fase 8). Fica DENTRO do card da interação no histórico do cliente —
// é o único lugar onde o corretor está olhando para um contato
// específico, que é justamente o que torna o vínculo um fato e não um
// palpite.
//
// Só é renderizado quando oportunidadeElegivel() aprova o contato (ver
// a página). Isso é UX: a action revalida a mesma regra no servidor.
//
// Mensagem de sucesso/erro exibida inline, com aria-live, para que quem
// usa leitor de tela receba o resultado sem precisar procurar na página.
export function BotaoCriarOportunidade({ interactionId }: { interactionId: string }) {
  const acao = criarOportunidadeDoContato.bind(null, interactionId);
  const [estado, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? "Criando..." : "Criar oportunidade"}
      </Button>
      {estado.message && (
        <span
          role="status"
          aria-live="polite"
          className={estado.success ? "text-xs text-muted-foreground" : "text-xs text-destructive"}
        >
          {estado.message}
        </span>
      )}
    </form>
  );
}
