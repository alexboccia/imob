export const siteConfig = {
  nome: process.env.NEXT_PUBLIC_NOME_IMOBILIARIA ?? "Imobiliária",
  whatsappNumero: process.env.NEXT_PUBLIC_WHATSAPP_NUMERO ?? "",
  emailContato: process.env.NEXT_PUBLIC_EMAIL_CONTATO ?? "contato@example.com",
  telefone:
    process.env.NEXT_PUBLIC_TELEFONE ??
    process.env.NEXT_PUBLIC_WHATSAPP_NUMERO ??
    "",
};

// Compartilhada entre o layout raiz (fallback genérico) e o layout de
// [orgSlug] (metadata por organização) — mesma descrição padrão nos dois
// níveis, só o nome muda.
export const DESCRICAO_PADRAO_SITE =
  "Encontre o imóvel ideal para comprar ou alugar.";
