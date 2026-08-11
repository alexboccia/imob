import { readFile } from "node:fs/promises";
import path from "node:path";
import { buscarBranding } from "@/lib/branding";
import { validarFaviconUrl } from "@/lib/branding/favicon-url";
import { withOrganization } from "@/lib/tenant-context";
import { logger } from "@/lib/logger";

// Extraído de [orgSlug]/icon.tsx pra não depender de @/lib/tenant.ts (que
// importa next-auth transitivamente) — recebe a organização já resolvida
// em vez de resolver por slug, o que também deixa a função testável direto
// (sem precisar simular o runtime do Next em teste).
//
// Superfície sensível: o valor de faviconUrl foi validado ao salvar
// (configuracoes/actions.ts), mas esta função NUNCA confia só nisso —
// trata o valor do banco como potencialmente hostil e revalida tudo de
// novo antes de buscar (defesa em profundidade: dado antigo, migração
// futura, bug em outro call site etc. nunca deveriam virar SSRF/proxy
// aberto só por causa desta rota). Content-Type de resposta é sempre
// restrito a um allowlist fixo — nunca repassa o header do upstream cru —
// e redirects nunca são seguidos.
const TIPOS_PERMITIDOS = new Set(["image/png", "image/jpeg", "image/webp"]);
const TIMEOUT_MS = 5000;

export async function faviconPadrao(): Promise<Response> {
  const bytes = await readFile(path.join(process.cwd(), "src/app/favicon.ico"));
  return new Response(bytes, { headers: { "Content-Type": "image/x-icon" } });
}

export async function construirRespostaFavicon(
  organization: { id: string; active: boolean } | null
): Promise<Response> {
  // Organização inexistente ou suspensa: nunca busca favicon customizado
  // — só o ícone padrão do produto. Mesmo tratamento neutro que
  // PublicLayout já dá pro resto do site público de um tenant suspenso.
  if (!organization || !organization.active) {
    return faviconPadrao();
  }

  const branding = await withOrganization(organization.id, () =>
    buscarBranding(organization.id)
  );

  if (branding.faviconUrl && validarFaviconUrl(branding.faviconUrl, organization.id)) {
    try {
      const resposta = await fetch(branding.faviconUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      const contentType = resposta.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase();

      if (resposta.ok && resposta.body && contentType && TIPOS_PERMITIDOS.has(contentType)) {
        return new Response(resposta.body, {
          headers: { "Content-Type": contentType },
        });
      }

      logger.warn(
        "Favicon da organização inacessível ou com Content-Type fora da allowlist, usando padrão",
        { organizationId: organization.id, route: "[orgSlug]/icon", modulo: "branding" }
      );
    } catch {
      // Timeout, DNS, conexão recusada etc. — nunca propaga o erro pro
      // cliente, sempre cai no favicon padrão.
      logger.warn("Falha ao buscar favicon da organização, usando padrão", {
        organizationId: organization.id,
        route: "[orgSlug]/icon",
        modulo: "branding",
      });
    }
  }

  return faviconPadrao();
}
