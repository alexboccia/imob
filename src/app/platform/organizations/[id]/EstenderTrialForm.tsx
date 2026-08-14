"use client";

import { useActionState } from "react";
import { estenderTrial } from "./actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EstenderTrialForm({ organizationId }: { organizationId: string }) {
  const estenderComId = estenderTrial.bind(null, organizationId);
  const [estado, formAction, pendente] = useActionState(estenderComId, ESTADO_INICIAL_ACAO);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={formAction}>
          <input type="hidden" name="modo" value="DIAS" />
          <input type="hidden" name="dias" value="7" />
          <Button type="submit" variant="outline" size="sm" disabled={pendente}>
            +7 dias
          </Button>
        </form>
        <form action={formAction}>
          <input type="hidden" name="modo" value="DIAS" />
          <input type="hidden" name="dias" value="14" />
          <Button type="submit" variant="outline" size="sm" disabled={pendente}>
            +14 dias
          </Button>
        </form>
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="modo" value="DATA" />
          <Input type="date" name="data" className="h-8 w-40" />
          <Button type="submit" variant="outline" size="sm" disabled={pendente}>
            Definir data
          </Button>
        </form>
      </div>
      {estado.message && (
        <p className={estado.success ? "text-sm text-green-600" : "text-sm text-destructive"}>
          {estado.message}
        </p>
      )}
    </div>
  );
}
