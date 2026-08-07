"use client";

import { useActionState } from "react";
import { atualizarUsuario } from "@/app/app/usuarios/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAPEL_USUARIO_LABEL } from "@/lib/format";
import { FotoCorretorUpload } from "@/components/admin/FotoCorretorUpload";

export function EditarUsuarioForm({
  usuario,
  ehVoceMesmo,
  podeGerenciarOwner,
}: {
  usuario: {
    id: string;
    nome: string;
    email: string;
    papel: string;
    ativo: boolean;
    foto: string | null;
    whatsapp: string | null;
    emailContato: string | null;
  };
  ehVoceMesmo: boolean;
  podeGerenciarOwner: boolean;
}) {
  const atualizarComId = atualizarUsuario.bind(null, usuario.id);
  const [estado, formAction, pendente] = useActionState(
    atualizarComId,
    ESTADO_INICIAL_ACAO
  );

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label>E-mail</Label>
            <Input value={usuario.email} disabled />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" defaultValue={usuario.nome} required />
            <ErroCampo erros={estado.fieldErrors?.nome} />
          </div>

          <FotoCorretorUpload fotoInicial={usuario.foto} />

          <div className="space-y-1.5">
            <Label htmlFor="whatsapp">WhatsApp do corretor (opcional)</Label>
            <Input
              id="whatsapp"
              name="whatsapp"
              defaultValue={usuario.whatsapp ?? ""}
              placeholder="5511999998888 (DDI + DDD + número, só dígitos)"
            />
            <p className="text-xs text-muted-foreground">
              Se vazio, os botões de WhatsApp dos imóveis deste corretor usam
              o número configurado em Configurações.
            </p>
            <ErroCampo erros={estado.fieldErrors?.whatsapp} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="emailContato">E-mail de contato (opcional)</Label>
            <Input
              id="emailContato"
              name="emailContato"
              type="email"
              defaultValue={usuario.emailContato ?? ""}
              placeholder="corretor@suaimobiliaria.com.br"
            />
            <p className="text-xs text-muted-foreground">
              Para onde vão as mensagens do formulário de contato dos imóveis
              deste corretor. Se vazio, usa o e-mail configurado em
              Configurações.
            </p>
            <ErroCampo erros={estado.fieldErrors?.emailContato} />
          </div>

          {ehVoceMesmo ? (
            <>
              <input type="hidden" name="papel" value={usuario.papel} />
              <input type="hidden" name="ativo" value="on" />
              <div className="space-y-1.5">
                <Label>Papel</Label>
                <p className="text-sm">
                  {PAPEL_USUARIO_LABEL[usuario.papel] ?? usuario.papel}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Você não pode alterar seu próprio papel nem desativar sua
                própria conta por aqui.
              </p>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="papel">Papel</Label>
                <Select name="papel" defaultValue={usuario.papel}>
                  <SelectTrigger id="papel" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Só quem já é proprietário pode conceder esse papel a
                        outro membro — a regra de verdade é sempre checada de
                        novo no servidor, isso aqui só evita oferecer uma
                        opção que vai ser recusada. */}
                    {(podeGerenciarOwner || usuario.papel === "OWNER") && (
                      <SelectItem value="OWNER">Proprietário</SelectItem>
                    )}
                    <SelectItem value="ADMIN">Administrador</SelectItem>
                    <SelectItem value="MANAGER">Gestor</SelectItem>
                    <SelectItem value="BROKER">Corretor</SelectItem>
                    <SelectItem value="ASSISTANT">Assistente</SelectItem>
                  </SelectContent>
                </Select>
                <ErroCampo erros={estado.fieldErrors?.papel} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="ativo" defaultChecked={usuario.ativo} />
                Usuário ativo
              </label>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="novaSenha">Nova senha (opcional)</Label>
            <Input
              id="novaSenha"
              name="novaSenha"
              type="password"
              placeholder="Deixe em branco para manter a senha atual"
              minLength={6}
            />
            <ErroCampo erros={estado.fieldErrors?.novaSenha} />
          </div>

          {!estado.success && estado.message && (
            <p className="text-sm text-destructive">{estado.message}</p>
          )}

          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
