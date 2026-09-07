import Link from "next/link";
import { FUSO_PADRAO } from "@/lib/fuso-horario";

// Aviso de adoção do fuso horário (Fase 19).
//
// A Fase 18 deixou Organization.timezone nullable com fallback explícito
// UTC — decisão correta: zero backfill, nenhum calendário deslocado sob
// uma organização que não pediu nada. O efeito colateral é que uma
// organização antiga só recebe o benefício quando configura, e nada na
// tela dizia isso.
//
// Este aviso NÃO bloqueia nada: a Central, a Agenda e os follow-ups
// funcionam normalmente com o fallback. Ele apenas torna visível um
// estado que já existia, e diz o que fazer a respeito. Sem modal, sem
// interrupção, sem backfill automático — a escolha do fuso continua
// sendo da organização.
export function AvisoFusoNaoConfigurado({ fusoConfigurado }: { fusoConfigurado: string | null }) {
  if (fusoConfigurado !== null) return null;

  return (
    <div
      // `status`, não `alert`: é informação de contexto, não uma
      // condição de erro que exige interrupção do leitor de tela.
      role="status"
      className="min-w-0 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <p className="min-w-0 break-words">
        Fuso horário ainda não configurado. Enquanto isso, o calendário usa {FUSO_PADRAO}.
      </p>
      <Link
        href="/app/configuracoes"
        className="mt-1 inline-block font-medium underline underline-offset-4"
      >
        Configurar fuso horário
      </Link>
    </div>
  );
}
