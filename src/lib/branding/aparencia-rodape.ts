// Catálogo de aparência do rodapé público — mesmo racional de temas.ts:
// fixo em código, nunca cor/CSS livre vinda do banco. OrganizationBranding.
// footerAppearance só guarda a chave (ver prisma/schema.prisma).
//
// AUTO deriva uma variação escura do --primary do tema em runtime via
// color-mix() (ver SiteFooter.tsx) — sem precisar de um token novo por
// tema no catálogo de temas.ts, e é o mesmo visual que o rodapé já tinha
// antes deste campo existir (fundo escuro fixo), então nenhum tenant
// existente muda de aparência só por este campo ter sido adicionado.
export type TipoAparenciaRodape = "AUTO" | "PRIMARY" | "LIGHT";

export type OpcaoAparenciaRodape = {
  id: TipoAparenciaRodape;
  label: string;
  descricao: string;
};

export const APARENCIA_RODAPE_PADRAO: TipoAparenciaRodape = "AUTO";

export const CATALOGO_APARENCIA_RODAPE: OpcaoAparenciaRodape[] = [
  {
    id: "AUTO",
    label: "Automático pelo tema",
    descricao: "Usa uma variação escura compatível com o tema selecionado.",
  },
  {
    id: "PRIMARY",
    label: "Cor principal do tema",
    descricao: "Usa a cor principal do tema como fundo.",
  },
  {
    id: "LIGHT",
    label: "Fundo claro",
    descricao: "Usa uma superfície clara e texto escuro.",
  },
];

// Fallback obrigatório: mesmo padrão de resolverTema — valor ausente/nulo
// ou que não existe mais no catálogo cai no padrão, nunca lança.
export function resolverAparenciaRodape(
  valor: string | null | undefined
): TipoAparenciaRodape {
  return CATALOGO_APARENCIA_RODAPE.some((opcao) => opcao.id === valor)
    ? (valor as TipoAparenciaRodape)
    : APARENCIA_RODAPE_PADRAO;
}
