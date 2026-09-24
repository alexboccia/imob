// Iniciais de um nome, para avatares sem foto.
//
// A mesma função já existia copiada em src/app/app/usuarios/columns.tsx e
// src/app/app/clientes/columns.tsx. A Fase 65 precisou dela numa terceira
// tela (a fila de novos contatos do Dashboard) e, em vez de fazer a
// terceira cópia, extraiu. As duas cópias antigas seguem no lugar — migrar
// aquelas telas é trabalho das fases seguintes, e mexer nelas agora seria
// ampliar o escopo desta.
export function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}
