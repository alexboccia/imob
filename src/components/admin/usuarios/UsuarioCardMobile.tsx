import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { PAPEL_USUARIO_LABEL } from "@/lib/format";
import { UsuarioAcoesCell } from "@/components/admin/usuarios/UsuarioAcoesCell";
import {
  PAPEL_BADGE_CLASS,
  STATUS_MEMBRO_LABEL,
  STATUS_MEMBRO_BADGE_VARIANT,
} from "@/components/admin/usuarios/usuarios-visual";
import type { UsuarioRow } from "@/app/app/usuarios/columns";

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase() || "?";
}

// Responsividade do painel administrativo — card usado abaixo de `md`
// (ver DataTable.tsx, prop `cards`), mesma causa raiz e mesmo padrão já
// estabelecido em ImovelCardMobile.tsx: a tabela desktop (Usuário/Papel/
// Status/Ações) não cabe em 360-375px sem exigir rolagem horizontal
// dentro do próprio `overflow-x-auto` do wrapper — que não conta como
// overflow do documento, mas deixa nome/e-mail/ações difíceis de ler sem
// arrastar a tabela pros lados (achado real da auditoria de
// responsividade). Mesmo UsuarioRow da tabela, nenhum valor recalculado —
// só reorganizado em bloco, reaproveitando UsuarioAcoesCell (mesma célula
// de ação da tabela, evita duplicar a regra de "Você"/podeGerenciar).
export function UsuarioCardMobile({ usuario }: { usuario: UsuarioRow }) {
  return (
    <div className="min-w-0 space-y-2 rounded-lg border p-3">
      <Link
        href={`/app/usuarios/${usuario.id}`}
        className="flex min-w-0 items-center gap-2.5 hover:underline"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-secondary-foreground">
          {iniciais(usuario.nome)}
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="truncate">{usuario.nome}</span>
            {usuario.ehVoceMesmo && (
              <span className="shrink-0 text-xs font-normal text-muted-foreground">(você)</span>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">{usuario.email}</span>
        </span>
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={PAPEL_BADGE_CLASS[usuario.papel]}>
          {PAPEL_USUARIO_LABEL[usuario.papel] ?? usuario.papel}
        </Badge>
        <Badge variant={STATUS_MEMBRO_BADGE_VARIANT[usuario.status] ?? "outline"}>
          {STATUS_MEMBRO_LABEL[usuario.status] ?? usuario.status}
        </Badge>
      </div>
      <UsuarioAcoesCell
        membershipId={usuario.id}
        ativo={usuario.ativo}
        ehVoceMesmo={usuario.ehVoceMesmo}
        podeGerenciar={usuario.podeGerenciar}
      />
    </div>
  );
}
