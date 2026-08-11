import { getOrganizationBySlug } from "@/lib/tenant";
import { construirRespostaFavicon } from "@/lib/branding/favicon-response";

// Favicon por organização. Não dá pra usar generateMetadata().icons pra
// isso: convenção baseada em arquivo (favicon.ico na raiz de app/) tem
// prioridade absoluta sobre o que generateMetadata retorna — está
// documentado (app-icons.md: "File-based metadata has the higher priority
// and will override the metadata object and generateMetadata function").
// `icon` (diferente de `favicon`) pode ser definido por segmento
// (app/**/*), então este arquivo aqui — só dentro de [orgSlug] — vence o
// favicon.ico da raiz pras páginas públicas, sem afetar /app nem
// /platform.
//
// A lógica de "o que servir" mora em favicon-response.ts (não depende de
// @/lib/tenant.ts, então é testável direto sem simular o runtime do
// Next) — aqui só resolve a organização pelo slug da URL e delega.
export default async function Icon({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  return construirRespostaFavicon(organization);
}
