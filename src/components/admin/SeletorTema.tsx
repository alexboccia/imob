import { CATALOGO_TEMAS, TEMA_PADRAO_ID } from "@/lib/branding/temas";

// Grade dos 6 temas pré-definidos — nunca um color picker livre. Cada
// opção é um radio nativo (name="themeId") com as pastilhas de cor lidas
// direto do catálogo em código, renderizadas no servidor.
export function SeletorTema({ themeIdAtual }: { themeIdAtual: string | null }) {
  const selecionado = themeIdAtual ?? TEMA_PADRAO_ID;

  return (
    <div className="min-w-0 space-y-1.5">
      <p className="min-w-0 break-words text-sm font-medium">Tema do site público</p>
      <p className="min-w-0 break-words text-sm text-muted-foreground mb-2">
        Define as cores de destaque (botões, links, bordas) das páginas
        públicas do seu site.
      </p>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Object.values(CATALOGO_TEMAS).map((tema) => (
          <label
            key={tema.id}
            className="relative flex min-w-0 flex-col items-start gap-2 rounded-lg border p-3 cursor-pointer sm:flex-row sm:items-center has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary"
          >
            <input
              type="radio"
              name="themeId"
              value={tema.id}
              defaultChecked={tema.id === selecionado}
              className="sr-only"
            />
            <span className="flex -space-x-1 shrink-0">
              <span
                className="w-5 h-5 rounded-full border border-black/10"
                style={{ backgroundColor: tema.primary }}
              />
              <span
                className="w-5 h-5 rounded-full border border-black/10"
                style={{ backgroundColor: tema.secondary }}
              />
              <span
                className="w-5 h-5 rounded-full border border-black/10"
                style={{ backgroundColor: tema.border }}
              />
            </span>
            <span className="min-w-0 break-words text-sm">{tema.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
