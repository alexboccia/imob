import { Image as ImageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { FotoCorretorUpload } from "@/components/admin/FotoCorretorUpload";

// Fase 130 — Card 2 de "Meu perfil público". Mecânica de upload
// INTEIRAMENTE reaproveitada de FotoCorretorUpload (seleção, envio,
// substituição, remoção, erro) — só o visual muda (variante "grande"),
// e só pra ESTA tela (a gestão de usuários continua com a moldura
// circular compacta de sempre).
export function CardFotoPublica({ foto }: { foto: string | null }) {
  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={ImageIcon}
          titulo="Foto pública"
          descricao="Aparece no site. É separada da foto usada no painel."
          tom="azul"
        />
        <FotoCorretorUpload
          fotoInicial={foto}
          pasta="perfil"
          name="perfilPublicoFoto"
          label="Foto pública (opcional)"
          alt="Foto pública do profissional"
          variante="grande"
        />
      </CardContent>
    </Card>
  );
}
