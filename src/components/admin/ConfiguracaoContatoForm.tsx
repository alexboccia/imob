"use client";

import { useActionState } from "react";
import { salvarConfiguracaoContato } from "@/app/app/configuracoes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { formatarCodigoImovel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { LogoUpload } from "@/components/admin/LogoUpload";
import { LogoRodapeUpload } from "@/components/admin/LogoRodapeUpload";
import { FaviconUpload } from "@/components/admin/FaviconUpload";
import { SeletorTema } from "@/components/admin/SeletorTema";
import { SeletorAparenciaRodape } from "@/components/admin/SeletorAparenciaRodape";
import { GeradorTemaLogotipo } from "@/components/admin/GeradorTemaLogotipo";
import { HeroImageUpload } from "@/components/admin/HeroImageUpload";
import { resolverTemaEfetivo, THEME_ID_CUSTOMIZADO, type TokensTema } from "@/lib/branding/temas";
import type { GrupoFusos } from "@/lib/fusos-opcoes";

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
  logoRodape: string | null;
  logoRodapeAltura: number;
  heroImage: string | null;
  themeId: string | null;
  favicon: string | null;
  nomePublico: string | null;
  footerAppearance: string | null;
  temaCustomizado: TokensTema | null;
  // Fase 18 — fuso horário comercial já resolvido (nunca null aqui: a
  // página aplica o fallback explícito antes de entregar).
  fuso: string;
  gruposDeFuso: GrupoFusos[];
};

export function ConfiguracaoContatoForm({ config }: { config: ConfiguracaoInicial }) {
  const [estado, formAction, pendente] = useActionState(
    salvarConfiguracaoContato,
    ESTADO_INICIAL_ACAO
  );

  return (
    <form action={formAction} className="space-y-5">
      {estado.message && !estado.success && (
        <Alert variant="destructive">
          <AlertDescription>{estado.message}</AlertDescription>
        </Alert>
      )}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Identidade visual</CardTitle>
          <CardDescription className="min-w-0 break-words">
            Configure como sua imobiliária aparece no site público.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-6">
          <div className="min-w-0 space-y-1.5">
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
          <SeletorTema
            themeIdAtual={config.themeId}
            temaCustomizado={
              config.temaCustomizado
                ? resolverTemaEfetivo(THEME_ID_CUSTOMIZADO, config.temaCustomizado)
                : null
            }
          />
          {/* A paleta persistida do tenant vira a base editável da
              seção — é o que faz a tela continuar mostrando as cores
              atuais ao voltar/recarregar, em vez de exigir 'Gerar'. */}
          <GeradorTemaLogotipo paletaInicial={config.temaCustomizado} />

          <div className="min-w-0 border-t pt-6">
            <HeroImageUpload heroImageInicial={config.heroImage} />
          </div>

          <div className="min-w-0 space-y-6 border-t pt-6">
            <div className="min-w-0 space-y-1.5">
              <p className="min-w-0 break-words text-sm font-medium">Rodapé do site</p>
              <p className="min-w-0 break-words text-sm text-muted-foreground">
                Use uma versão do logotipo adequada ao fundo do rodapé.
              </p>
            </div>
            <LogoRodapeUpload
              logoInicial={config.logoRodape}
              alturaInicial={config.logoRodapeAltura}
            />
            <SeletorAparenciaRodape aparenciaAtual={config.footerAppearance} />
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="min-w-0 break-words">Contato</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 space-y-4">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="telefone">Telefone</Label>
              <Input
                id="telefone"
                name="telefone"
                defaultValue={config.telefone}
                placeholder="+55 (11) 3888-3000"
              />
              <ErroCampo erros={estado.fieldErrors?.telefone} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="whatsapp">WhatsApp</Label>
              <Input
                id="whatsapp"
                name="whatsapp"
                defaultValue={config.whatsapp}
                placeholder="5511999998888 (DDI + DDD + número, só dígitos)"
              />
              <ErroCampo erros={estado.fieldErrors?.whatsapp} />
            </div>
            <div className="min-w-0 space-y-1.5">
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

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="min-w-0 break-words">Redes sociais</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 space-y-4">
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="instagram">Instagram</Label>
              <Input
                id="instagram"
                name="instagram"
                defaultValue={config.instagram}
                placeholder="https://instagram.com/suaimobiliaria"
              />
              <ErroCampo erros={estado.fieldErrors?.instagram} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="facebook">Facebook</Label>
              <Input
                id="facebook"
                name="facebook"
                defaultValue={config.facebook}
                placeholder="https://facebook.com/suaimobiliaria"
              />
              <ErroCampo erros={estado.fieldErrors?.facebook} />
            </div>
            <div className="min-w-0 space-y-1.5">
              <Label htmlFor="youtube">YouTube</Label>
              <Input
                id="youtube"
                name="youtube"
                defaultValue={config.youtube}
                placeholder="https://youtube.com/@suaimobiliaria"
              />
              <ErroCampo erros={estado.fieldErrors?.youtube} />
            </div>
            <div className="min-w-0 space-y-1.5">
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
      </div>

      {/* Fuso horário (Fase 18). Fica em Configurações, junto do resto
          da configuração institucional — nenhuma tela nova. */}
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Fuso horário da organização</CardTitle>
          <CardDescription className="min-w-0 break-words">
            Usado para Agenda, Central e períodos do Analytics. Alterar o fuso não muda nenhuma
            data já registrada — muda apenas como os dias e horários são interpretados e
            exibidos.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="timezone">Fuso horário</Label>
            {/* <select> NATIVO: busca por digitação, teclado e leitor de
                tela funcionam sem JavaScript, e não há divergência entre
                servidor e cliente. O rótulo é legível; o valor salvo é
                sempre o identificador IANA. */}
            <select
              id="timezone"
              name="timezone"
              defaultValue={config.fuso}
              className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:w-96"
            >
              {config.gruposDeFuso.map((grupo) => (
                <optgroup key={grupo.titulo} label={grupo.titulo}>
                  {grupo.opcoes.map((opcao) => (
                    <option key={opcao.valor} value={opcao.valor}>
                      {opcao.rotulo}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <ErroCampo erros={estado.fieldErrors?.timezone} />
            <p className="min-w-0 break-words text-xs text-muted-foreground">
              Configuração atual: {config.fuso}.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Código do imóvel</CardTitle>
          <CardDescription className="min-w-0 break-words">
            Os imóveis recebem um código numérico automático (ex: 100001).
            Defina um prefixo opcional para personalizar como ele é exibido.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="min-w-0 space-y-1.5">
            <Label htmlFor="codigoImovelPrefixo">Prefixo</Label>
            <Input
              id="codigoImovelPrefixo"
              name="codigoImovelPrefixo"
              defaultValue={config.codigoImovelPrefixo}
              placeholder="Ex: IMB"
              maxLength={10}
              className="w-full uppercase placeholder:normal-case sm:w-48"
            />
            <ErroCampo erros={estado.fieldErrors?.codigoImovelPrefixo} />
            <p className="min-w-0 break-words text-xs text-muted-foreground">
              Ficará assim:{" "}
              {formatarCodigoImovel(100001, config.codigoImovelPrefixo || null)}
            </p>
          </div>
        </CardContent>
      </Card>

      <Button
        type="submit"
        size="lg"
        disabled={pendente}
        className="h-auto min-h-9 min-w-0 shrink whitespace-normal"
      >
        {pendente ? "Salvando..." : "Salvar alterações"}
      </Button>
    </form>
  );
}
