import { IconeBusca, IconeCheck, IconeMensagem } from "@/components/icons";

// Faixa de confiança logo abaixo do hero. Deliberadamente SEM número
// nenhum: o produto não tem dado agregado real de imóveis vendidos,
// clientes atendidos ou anos de experiência, e inventar isso viraria
// afirmação falsa no site de todo tenant. Cada item descreve algo que o
// sistema realmente faz — publicação revisada no painel, filtros reais de
// busca, e um responsável por anúncio — então continua verdadeiro para
// qualquer imobiliária, sem configuração e sem dado por tenant.
//
// Cores vêm de --primary (injetada por organização em
// [orgSlug]/layout.tsx): acompanha a paleta de qualquer tenant, nada
// hardcoded.
const ITENS = [
  {
    Icone: IconeCheck,
    titulo: "Imóveis selecionados",
    texto: "Cada anúncio é publicado e mantido pela equipe da imobiliária.",
  },
  {
    Icone: IconeBusca,
    titulo: "Busca por região",
    texto: "Filtre por cidade, bairro, tipo de imóvel e faixa de preço.",
  },
  {
    Icone: IconeMensagem,
    titulo: "Contato direto",
    texto: "Fale com quem acompanha o imóvel, sem formulário genérico.",
  },
];

export function FaixaConfianca() {
  return (
    <section aria-label="Como trabalhamos" className="border-b bg-secondary/40">
      <ul className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-8 sm:grid-cols-3 sm:gap-8">
        {ITENS.map(({ Icone, titulo, texto }) => (
          <li key={titulo} className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
            >
              <Icone className="size-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-gray-900">{titulo}</span>
              <span className="mt-0.5 block text-sm text-gray-600">{texto}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
