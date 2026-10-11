import { linkWhatsApp, temWhatsApp } from "@/lib/whatsapp";

// =======================================================================
// Suporte oficial do SaaS (Fase 112) — funções PURAS, sem Prisma
// =======================================================================
// Deliberadamente sem import de @/lib/prisma: este módulo é importado
// pelo ConfiguracaoSuporteForm.tsx ("use client") para a prévia do link
// de WhatsApp em tempo real. Um import de prisma aqui arrasta `pg` pro
// bundle do navegador e quebra o build (confirmado: erro real de
// "Module not found: Can't resolve 'tls'"/"util/types" ao tentar). A
// leitura do banco (buscarConfiguracaoSuporte) mora em
// src/lib/plataforma-suporte-dados.ts, nunca importado por um
// Client Component.
//
// Contato da PLATAFORMA (quem opera o produto) — nunca confundir com o
// telefone/whatsapp de uma Organization (OrganizationSettings), que é o
// contato comercial de cada imobiliária.

// Aceita número brasileiro com ou sem DDI: "11976069213" (10/11 dígitos,
// assume Brasil e prefixa 55) ou "5511976069213" (12/13 dígitos, já com
// 55). Qualquer outro formato — poucos dígitos, DDI diferente, letras —
// é rejeitado. Retorna null quando inválido; nunca lança.
export function normalizarTelefoneSuporte(valor: string): string | null {
  const digitos = valor.replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55")) {
    return digitos;
  }
  return null;
}

// E.164 só para EXIBIÇÃO ("+5511976069213") — o que é persistido é
// sempre só os dígitos (ver normalizarTelefoneSuporte).
export function telefoneSuporteE164(digitos: string): string {
  return `+${digitos}`;
}

// O link nunca aceita uma URL vinda do usuário — é sempre CONSTRUÍDO a
// partir dos dígitos já validados e persistidos, pelo mesmo helper
// genérico usado para o WhatsApp de cada organização.
export function linkWhatsAppSuporte(digitos: string | null): string | null {
  return linkWhatsApp(digitos);
}

export function temTelefoneSuporte(digitos: string | null): boolean {
  return temWhatsApp(digitos);
}
