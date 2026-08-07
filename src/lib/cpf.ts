export function normalizarCpf(valor: string): string {
  return valor.replace(/\D/g, "").slice(0, 11);
}

export function formatarCpf(valor: string): string {
  const digitos = normalizarCpf(valor);
  if (digitos.length <= 3) return digitos;
  if (digitos.length <= 6) return `${digitos.slice(0, 3)}.${digitos.slice(3)}`;
  if (digitos.length <= 9)
    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6)}`;
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
}

function calcularDigitoVerificador(digitos: string, pesoInicial: number): number {
  const soma = digitos
    .split("")
    .reduce((acc, digito, i) => acc + Number(digito) * (pesoInicial - i), 0);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function cpfValido(valor: string): boolean {
  const digitos = normalizarCpf(valor);
  if (digitos.length !== 11) return false;
  // CPFs com todos os dígitos iguais têm dígito verificador válido pelo
  // algoritmo abaixo, mas não são CPFs reais emitidos (regra conhecida).
  if (/^(\d)\1{10}$/.test(digitos)) return false;

  const primeiroDigito = calcularDigitoVerificador(digitos.slice(0, 9), 10);
  if (primeiroDigito !== Number(digitos[9])) return false;

  const segundoDigito = calcularDigitoVerificador(digitos.slice(0, 10), 11);
  return segundoDigito === Number(digitos[10]);
}
