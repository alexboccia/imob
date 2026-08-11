export function formatarTelefone(valor: string): string {
  const digitos = valor.replace(/\D/g, "").slice(0, 11);
  if (digitos.length === 0) return "";
  if (digitos.length <= 2) return `(${digitos}`;
  if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  if (digitos.length <= 10)
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}

export function telefoneValido(valor: string): boolean {
  const digitos = valor.replace(/\D/g, "");
  return digitos.length === 10 || digitos.length === 11;
}

// Só dígitos, sem inventar DDI — mesma regra implícita que telefoneValido
// já usa (10-11 dígitos locais, sem prefixo "55"). Usado pra deduplicação
// de Person (src/lib/person-dedup.ts): dois envios do "mesmo" telefone em
// formatos diferentes ("(11) 99999-9999" vs "11999999999") precisam
// resolver pro mesmo valor normalizado.
//
// null quando não sobra nenhum dígito (telefone legado tipo "abc", " - ",
// ou vazio) — nunca retorna "". "" é um valor real pra fins de unique
// constraint (diferente de NULL); sem essa guarda, toda Person com
// telefone inválido colidiria entre si.
export function normalizarTelefone(valor: string): string | null {
  return valor.replace(/\D/g, "") || null;
}
