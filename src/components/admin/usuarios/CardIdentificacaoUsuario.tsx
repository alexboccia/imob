import { UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { FotoCorretorUpload } from "@/components/admin/FotoCorretorUpload";

// Fase 131 — Card 1 de "Editar usuário": identidade da conta (e-mail de
// acesso, somente leitura; nome) e a foto usada DENTRO do painel —
// campo e pasta de upload distintos da foto pública (ver
// FotoCorretorUpload, variante "grande" só muda o visual).
export function CardIdentificacaoUsuario({
  email,
  nome,
  foto,
  erroNome,
}: {
  email: string;
  nome: string;
  foto: string | null;
  erroNome?: string[];
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={UserRound}
          titulo="Identificação"
          descricao="Dados de acesso e identidade deste usuário no painel."
          tom="azul"
        />

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-1.5">
            <Label>E-mail</Label>
            <Input value={email} disabled className="h-10" />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" className="h-10" defaultValue={nome} required />
            <ErroCampo erros={erroNome} />
          </div>
        </div>

        <FotoCorretorUpload
          fotoInicial={foto}
          label="Foto no painel"
          alt="Foto do usuário no painel"
          descricao="Usada apenas dentro do painel. Não aparece no site público."
          variante="grande"
        />
      </CardContent>
    </Card>
  );
}
