export function ErroCampo({ erros }: { erros?: string[] }) {
  if (!erros || erros.length === 0) return null;
  return <p className="text-xs text-destructive mt-1">{erros[0]}</p>;
}
