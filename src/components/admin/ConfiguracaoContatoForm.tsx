"use client";

import { useActionState } from "react";
import { salvarConfiguracaoContato } from "@/app/app/configuracoes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { formatarCodigoImovel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { LogoUpload } from "@/components/admin/LogoUpload";
import { FaviconUpload } from "@/components/admin/FaviconUpload";
import { SeletorTema } from "@/components/admin/SeletorTema";

type ConfiguracaoInicial = {
  telefone: string;
  whatsapp: string;
  email: string;
  instagram: string;
  facebook: string;
  youtube: string;
  linkedin: string;
  codigoImovelPrefixo: string;
  logo: string | null;
  logoAltura: number;
  themeId: string | null;
  favicon: string | null;
  nomePublico: string | null;
};

export function ConfiguracaoContatoForm({ config }: { config: ConfiguracaoInicial }) {
  const [estado, formAction, pendente] = useActionState(
    salvarConfiguracaoContato,
    ESTADO_INICIAL_ACAO
  );

  return (
    <form action={formAction} className="space-y-6">
      {estado.message && !estado.success && (
        <Alert variant="destructive">
          <AlertDescription>{estado.message}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identidade visual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="nomePublico">Nome público (opcional)</Label>
            <Input
              id="nomePublico"
              name="nomePublico"
              defaultValue={config.nomePublico ?? ""}
              placeholder="Deixe em branco para usar o nome cadastrado da organização"
              maxLength={120}
            />
            <ErroCampo erros={estado.fieldErrors?.nomePublico} />
          </div>
          <LogoUpload logoInicial={config.logo} alturaInicial={config.logoAltura} />
          <FaviconUpload faviconInicial={config.favicon} />
          <SeletorTema themeIdAtual={config.themeId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contato</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="telefone">Telefone</Label>
            <Input
              id="telefone"
              name="telefone"
              defaultValue={config.telefone}
              placeholder="+55 (11) 3888-3000"
            />
            <ErroCampo erros={estado.fieldErrors?.telefone} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <Input
              id="whatsapp"
              name="whatsapp"
              defaultValue={config.whatsapp}
              placeholder="5511999998888 (DDI + DDD + número, só dígitos)"
            />
            <ErroCampo erros={estado.fieldErrors?.whatsapp} />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={config.email}
              placeholder="contato@suaimobiliaria.com.br"
            />
            <ErroCampo erros={estado.fieldErrors?.email} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Redes sociais</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="instagram">Instagram</Label>
            <Input
              id="instagram"
              name="instagram"
              defaultValue={config.instagram}
              placeholder="https://instagram.com/suaimobiliaria"
            />
            <ErroCampo erros={estado.fieldErrors?.instagram} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="facebook">Facebook</Label>
            <Input
              id="facebook"
              name="facebook"
              defaultValue={config.facebook}
              placeholder="https://facebook.com/suaimobiliaria"
            />
            <ErroCampo erros={estado.fieldErrors?.facebook} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="youtube">YouTube</Label>
            <Input
              id="youtube"
              name="youtube"
              defaultValue={config.youtube}
              placeholder="https://youtube.com/@suaimobiliaria"
            />
            <ErroCampo erros={estado.fieldErrors?.youtube} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="linkedin">LinkedIn</Label>
            <Input
              id="linkedin"
              name="linkedin"
              defaultValue={config.linkedin}
              placeholder="https://linkedin.com/company/suaimobiliaria"
            />
            <ErroCampo erros={estado.fieldErrors?.linkedin} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Código do imóvel</CardTitle>
          <p className="text-sm text-muted-foreground">
            Os imóveis recebem um código numérico automático (ex: 100001).
            Defina um prefixo opcional para personalizar como ele é exibido.
          </p>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label htmlFor="codigoImovelPrefixo">Prefixo</Label>
            <Input
              id="codigoImovelPrefixo"
              name="codigoImovelPrefixo"
              defaultValue={config.codigoImovelPrefixo}
              placeholder="Ex: IMB"
              maxLength={10}
              className="w-full sm:w-48 uppercase placeholder:normal-case"
            />
            <ErroCampo erros={estado.fieldErrors?.codigoImovelPrefixo} />
            <p className="text-xs text-muted-foreground">
              Ficará assim:{" "}
              {formatarCodigoImovel(100001, config.codigoImovelPrefixo || null)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Button type="submit" size="lg" disabled={pendente}>
        {pendente ? "Salvando..." : "Salvar"}
      </Button>
    </form>
  );
}
