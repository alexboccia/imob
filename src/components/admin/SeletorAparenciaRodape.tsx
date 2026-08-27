import {
  CATALOGO_APARENCIA_RODAPE,
  APARENCIA_RODAPE_PADRAO,
} from "@/lib/branding/aparencia-rodape";

// Lista vertical de 3 opções fixas — mesmo padrão de radio nativo de
// SeletorTema.tsx (name="footerAparencia"), só sem pastilhas de cor
// (aqui cada opção já tem título + descrição própria, ver mockup).
export function SeletorAparenciaRodape({
  aparenciaAtual,
}: {
  aparenciaAtual: string | null;
}) {
  const selecionado = aparenciaAtual ?? APARENCIA_RODAPE_PADRAO;

  return (
    <div className="min-w-0 space-y-1.5">
      <p className="min-w-0 break-words text-sm font-medium">Aparência do rodapé</p>
      <div className="space-y-2">
        {CATALOGO_APARENCIA_RODAPE.map((opcao) => (
          <label
            key={opcao.id}
            className="relative flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:ring-1 has-[:checked]:ring-primary"
          >
            <input
              type="radio"
              name="footerAparencia"
              value={opcao.id}
              defaultChecked={opcao.id === selecionado}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input after:size-2 after:rounded-full after:bg-primary after:opacity-0 peer-checked:border-primary peer-checked:after:opacity-100"
            />
            <span className="min-w-0 space-y-0.5">
              <span className="block min-w-0 break-words text-sm font-medium">
                {opcao.label}
              </span>
              <span className="block min-w-0 break-words text-sm text-muted-foreground">
                {opcao.descricao}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
