"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Fase 106 — antes deste arquivo, nenhum error.tsx existia em src/app/app:
// uma exceção não tratada em QUALQUER tela autenticada (Clientes, Imóveis,
// Pipeline, Agenda, Comissões...) subia até global-error.tsx, trocando a
// árvore inteira (inclusive o layout com a navegação) por "Algo deu
// errado" e exigindo recarregar a página inteira.
//
// Este boundary cobre o layout de /app/* (sidebar/navegação continuam de
// pé — error.tsx nunca substitui o layout.tsx do PRÓPRIO segmento),
// isolando a falha só na área de conteúdo quebrada, com retry sem perder
// a navegação.
export default function AppErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <h2 className="text-lg font-semibold">Algo deu errado nesta tela</h2>
      <p className="max-w-md text-sm text-muted-foreground">
        Já fomos avisados do problema. Você pode tentar de novo sem perder o resto da navegação.
      </p>
      <Button type="button" onClick={() => unstable_retry()} className="mt-2">
        Tentar novamente
      </Button>
    </div>
  );
}
