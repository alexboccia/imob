import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { formatarCodigoImovel } from "@/lib/format";
import { salvarConfiguracaoContato } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { LogoUpload } from "@/components/admin/LogoUpload";

export default async function ConfiguracoesPage() {
  const config = await buscarConfiguracaoContato();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">Contato e redes sociais</h1>
      <p className="text-muted-foreground mb-6">
        Esses dados alimentam o botão de contato flutuante, o WhatsApp dos
        imóveis e outros pontos de contato do site público.
      </p>

      <form action={salvarConfiguracaoContato} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identidade visual</CardTitle>
          </CardHeader>
          <CardContent>
            <LogoUpload logoInicial={config.logo} alturaInicial={config.logoAltura} />
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                name="whatsapp"
                defaultValue={config.whatsapp}
                placeholder="5511999998888 (DDI + DDD + número, só dígitos)"
              />
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
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="facebook">Facebook</Label>
              <Input
                id="facebook"
                name="facebook"
                defaultValue={config.facebook}
                placeholder="https://facebook.com/suaimobiliaria"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="youtube">YouTube</Label>
              <Input
                id="youtube"
                name="youtube"
                defaultValue={config.youtube}
                placeholder="https://youtube.com/@suaimobiliaria"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="linkedin">LinkedIn</Label>
              <Input
                id="linkedin"
                name="linkedin"
                defaultValue={config.linkedin}
                placeholder="https://linkedin.com/company/suaimobiliaria"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Código do imóvel</CardTitle>
            <p className="text-sm text-muted-foreground">
              Os imóveis recebem um código numérico automático (ex: 100001).
              Defina um prefixo opcional para personalizar como ele é
              exibido.
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
              <p className="text-xs text-muted-foreground">
                Ficará assim:{" "}
                {formatarCodigoImovel(100001, config.codigoImovelPrefixo || null)}
              </p>
            </div>
          </CardContent>
        </Card>

        <Button type="submit" size="lg">
          Salvar
        </Button>
      </form>
    </div>
  );
}
