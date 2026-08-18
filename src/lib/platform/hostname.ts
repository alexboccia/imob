import { SLUGS_RESERVADOS } from "./reserved-words";

// Rótulo de host válido — RFC 1123 simplificado (sem exigir TLD:
// "localhost" é um label único legítimo, ver normalizarHostname).
// 1-63 chars, alfanumérico, hífen permitido no meio, nunca começa/termina
// com hífen.
const LABEL_REGEX = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_REGEX = /^\d{1,3}(\.\d{1,3}){3}$/;

// Normaliza um hostname bruto (vindo do header Host de uma requisição, ou
// digitado por um Platform Operator) pra um formato canônico único:
// lowercase, sem protocolo, sem porta, sem path/query/fragment, sem
// trailing dot. Retorna null (rejeita explicitamente, nunca corrige
// silenciosamente uma entrada estruturalmente errada como "https://x" ou
// "x/y" — ver P.10.1.1) quando a entrada não é um hostname válido.
//
// Deliberadamente NÃO exige um "." (TLD) — "localhost" é uma saída válida
// (ver P.10.1.1, "tratamento local explícito"). Se algo não pode ser
// reivindicado como domínio real (localhost, host da própria plataforma,
// etc.) é responsabilidade de hostnameReservado, uma checagem SEPARADA —
// esta função só valida formato/sintaxe.
export function normalizarHostname(bruto: string): string | null {
  if (typeof bruto !== "string") return null;
  const valor = bruto.trim();
  if (!valor) return null;

  // Protocolo (ex: "https://...") nunca é aceito nem stripado — quem
  // chamou passou uma URL, não um hostname puro.
  if (valor.includes("://")) return null;

  // Path, query ou fragment presentes: mesma rejeição explícita.
  if (/[/?#]/.test(valor)) return null;

  // Porta: só aceita ":<dígitos>" no final (ex: "localhost:3000",
  // "www.xyz.com.br:443"). Qualquer outro ":" restante (ex: literal
  // IPv6) não é suportado.
  const semPorta = valor.replace(/:\d+$/, "");
  if (semPorta.includes(":")) return null;

  let host = semPorta.toLowerCase();

  // Trailing dot (FQDN absoluta, ex: "www.xyz.com.br.") — um único
  // trailing dot é uma forma alternativa válida do mesmo hostname.
  if (host.endsWith(".")) host = host.slice(0, -1);
  if (!host) return null;

  // Wildcard arbitrário nunca aceito.
  if (host.includes("*")) return null;

  // IP literal nunca aceito como customDomain.
  if (IPV4_REGEX.test(host)) return null;

  const labels = host.split(".");
  if (labels.some((label) => !LABEL_REGEX.test(label))) return null;

  return host;
}

// Hosts que uma Organization NUNCA pode reivindicar como
// OrganizationDomain — hosts internos/locais, origin da hospedagem
// (DigitalOcean), o domínio oficial da plataforma (NEXT_PUBLIC_SITE_URL),
// e labels reservados sob o domínio-base de subdomínio easymob
// (PUBLIC_ORG_SUBDOMAIN_BASE, quando configurado) — mesma lista de slugs
// reservados usada pra Organization.slug (SLUGS_RESERVADOS), por
// consistência: um slug reservado nunca pode virar
// "<slug>.{PUBLIC_ORG_SUBDOMAIN_BASE}" também.
//
// Espera receber um hostname JÁ normalizado (normalizarHostname) — não
// normaliza de novo.
export function hostnameReservado(hostnameNormalizado: string): boolean {
  const host = hostnameNormalizado.toLowerCase();

  if (host === "localhost" || host === "127.0.0.1") return true;
  if (host === "ondigitalocean.app" || host.endsWith(".ondigitalocean.app")) return true;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    try {
      const siteHost = new URL(siteUrl).hostname.toLowerCase();
      if (siteHost && host === siteHost) return true;
    } catch {
      // NEXT_PUBLIC_SITE_URL malformado — nunca deixa a checagem de
      // reservado quebrar por causa disso, só ignora essa comparação.
    }
  }

  const baseSubdominio = process.env.PUBLIC_ORG_SUBDOMAIN_BASE?.toLowerCase().trim();
  if (baseSubdominio) {
    if (host === baseSubdominio) return true;
    const sufixo = `.${baseSubdominio}`;
    if (host.endsWith(sufixo)) {
      const label = host.slice(0, -sufixo.length);
      if (!label.includes(".") && SLUGS_RESERVADOS.has(label)) return true;
    }
  }

  return false;
}
