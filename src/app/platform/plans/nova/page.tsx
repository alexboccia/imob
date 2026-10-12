import { requirePlatformOperator } from "@/lib/platform/auth";
import { CriarPlanoForm } from "./CriarPlanoForm";

export default async function CriarPlanoPage() {
  await requirePlatformOperator();

  return (
    <div className="max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Criar plano</h1>
        <p className="text-sm text-muted-foreground mt-1">
          O plano nasce ativo e sem organizações vinculadas. Preço e limites podem ser ajustados
          depois em qualquer momento.
        </p>
      </div>
      <CriarPlanoForm />
    </div>
  );
}
