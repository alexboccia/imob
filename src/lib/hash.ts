import { createHash } from "node:crypto";

// Hash curto e não-reversível, usado só pra correlacionar identificadores
// (e-mail/telefone) em logs de abuso sem gravar o dado pessoal em si.
export function hashCurto(valor: string): string {
  return createHash("sha256").update(valor.trim().toLowerCase()).digest("hex").slice(0, 12);
}
