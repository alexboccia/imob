export const siteConfig = {
  nome: process.env.NEXT_PUBLIC_NOME_IMOBILIARIA ?? "Imobiliária",
  whatsappNumero: process.env.NEXT_PUBLIC_WHATSAPP_NUMERO ?? "",
  emailContato: process.env.NEXT_PUBLIC_EMAIL_CONTATO ?? "contato@example.com",
  telefone:
    process.env.NEXT_PUBLIC_TELEFONE ??
    process.env.NEXT_PUBLIC_WHATSAPP_NUMERO ??
    "",
};
