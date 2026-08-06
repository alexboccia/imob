"use client";

import { useActionState } from "react";
import { atualizarUsuario } from "@/app/admin/usuarios/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PAPEL_USUARIO_LABEL } from "@/lib/format";
import { FotoCorretorUpload } from "@/components/admin/FotoCorretorUpload";

const estadoInicial = { sucesso: false, erro: undefined as string | undefined };

export function EditarUsuarioForm({
  usuario,
  ehVoceMesmo,
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
}) {
  const atualizarComId = atualizarUsuario.bind(null, usuario.id);
  const [estado, formAction, pendente] = useActionState(
    atualizarComId,
    estadoInicial
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
                    <SelectItem value="ADMINISTRADOR">Administrador</SelectItem>
                    <SelectItem value="GESTOR">Gestor</SelectItem>
                    <SelectItem value="CORRETOR">Corretor</SelectItem>
                  </SelectContent>
                </Select>
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
          </div>

          {estado.erro && (
            <p className="text-sm text-destructive">{estado.erro}</p>
          )}

          <Button type="submit" disabled={pendente}>
            {pendente ? "Salvando..." : "Salvar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
