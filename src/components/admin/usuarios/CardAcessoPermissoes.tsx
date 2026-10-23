import { ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CabecalhoSecao } from "@/components/admin/ui/CabecalhoSecao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ErroCampo } from "@/components/admin/ErroCampo";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAPEL_USUARIO_LABEL } from "@/lib/format";
import { rotuloSelecionado } from "@/lib/select-rotulo";

// Fase 131 — Card 3 de "Editar usuário": papel, status e redefinição de
// senha. Mesma regra de sempre preservada ao pé da letra: editando a si
// mesmo, papel e status vão como campo oculto (o próprio usuário não
// pode se rebaixar nem se desativar por aqui) — só o visual mudou.
export function CardAcessoPermissoes({
  papel,
  ativo,
  ehVoceMesmo,
  podeGerenciarOwner,
  erroPapel,
  erroNovaSenha,
}: {
  papel: string;
  ativo: boolean;
  ehVoceMesmo: boolean;
  podeGerenciarOwner: boolean;
  erroPapel?: string[];
  erroNovaSenha?: string[];
}) {
  return (
    <Card className="min-w-0">
      <CardContent className="min-w-0 space-y-4">
        <CabecalhoSecao
          icone={ShieldCheck}
          titulo="Acesso e permissões"
          descricao="Papel no sistema, status da conta e redefinição de senha."
          tom="azul"
        />

        {ehVoceMesmo ? (
          <>
            <input type="hidden" name="papel" value={papel} />
            <input type="hidden" name="ativo" value="on" />
            <div className="space-y-1.5">
              <Label>Papel</Label>
              <p className="text-sm">{PAPEL_USUARIO_LABEL[papel] ?? papel}</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Você não pode alterar seu próprio papel nem desativar sua
              própria conta por aqui.
            </p>
          </>
        ) : (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="papel">Papel</Label>
              <Select name="papel" defaultValue={papel}>
                <SelectTrigger id="papel" className="w-full">
                  {/* Sem children, o trigger mostra o valor cru do enum
                      (ex.: "BROKER") em vez do rótulo ("Corretor") — mesmo
                      achado já corrigido em outras telas (ver
                      select-rotulo.ts). */}
                  <SelectValue>{rotuloSelecionado(papel, PAPEL_USUARIO_LABEL, "Papel")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {/* Só quem já é proprietário pode conceder esse papel a
                      outro membro — a regra de verdade é sempre checada de
                      novo no servidor, isso aqui só evita oferecer uma
                      opção que vai ser recusada. */}
                  {(podeGerenciarOwner || papel === "OWNER") && (
                    <SelectItem value="OWNER">Proprietário</SelectItem>
                  )}
                  <SelectItem value="ADMIN">Administrador</SelectItem>
                  <SelectItem value="MANAGER">Gestor</SelectItem>
                  <SelectItem value="BROKER">Corretor</SelectItem>
                  <SelectItem value="ASSISTANT">Assistente</SelectItem>
                </SelectContent>
              </Select>
              <ErroCampo erros={erroPapel} />
            </div>

            <div className="min-w-0 space-y-1.5">
              <Label>Status</Label>
              <label className="flex items-center gap-2.5 text-sm">
                <Switch name="ativo" defaultChecked={ativo} />
                Usuário ativo
              </label>
            </div>
          </div>
        )}

        <div className="space-y-1.5 border-t pt-4">
          <Label htmlFor="novaSenha">Nova senha (opcional)</Label>
          <Input
            id="novaSenha"
            name="novaSenha"
            type="password"
            className="h-10"
            placeholder="Deixe em branco para manter a senha atual"
            minLength={6}
            aria-invalid={erroNovaSenha ? true : undefined}
          />
          <ErroCampo erros={erroNovaSenha} />
        </div>
      </CardContent>
    </Card>
  );
}
