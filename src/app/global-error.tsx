"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Última rede de segurança: só dispara quando o próprio root layout (ou
// algo acima dele) quebra — erro de Server/Client Component em qualquer
// outro ponto da árvore já é pego pelo error.tsx mais próximo ou por
// onRequestError (src/instrumentation.ts). Precisa renderizar <html>/<body>
// próprios porque substitui a árvore inteira, inclusive o root layout.
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.75rem",
            padding: "1.5rem",
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Algo deu errado</h1>
          <p style={{ color: "#666", maxWidth: "28rem" }}>
            Já fomos avisados do problema. Tente novamente em alguns instantes.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "0.5rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.375rem",
              border: "1px solid #ccc",
              cursor: "pointer",
            }}
          >
            Recarregar página
          </button>
        </div>
      </body>
    </html>
  );
}
