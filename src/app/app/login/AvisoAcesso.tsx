"use client";

import { useSearchParams } from "next/navigation";

// Componente próprio, e não um trecho da página de login, por uma razão
// de build: useSearchParams obriga uma fronteira de Suspense, e sem ela
// a rota inteira sai da renderização estática. Isolar o aviso mantém o
// resto do login como estava.
//
// Os avisos são CONFIRMAÇÕES de ações concluídas ("ativei", "redefini").
// Nenhum deles diz nada sobre a conta — não confirmam existência de
// e-mail nem estado de vínculo.
export function AvisoAcesso() {
  const params = useSearchParams();
  const texto = params.get("cadastro")
    ? "Imobiliária criada. Entre com seu e-mail e a senha que você escolheu."
    : params.get("convite")
    ? "Conta ativada. Entre com seu e-mail e a senha que você criou."
    : params.get("senha")
      ? "Senha redefinida. Entre com a nova senha."
      : null;

  if (!texto) return null;
  return (
    <p role="status" className="text-sm font-medium text-emerald-700">
      {texto}
    </p>
  );
}
