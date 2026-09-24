"use client";

import { useActionState, useEffect, useRef } from "react";
import { salvarConfiguracaoContato } from "@/app/app/configuracoes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { formatarCodigoImovel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { CorBarraTopo } from "@/components/admin/CorBarraTopo";
import { AbasConfiguracoes } from "@/components/admin/AbasConfiguracoes";
import { PreviaIdentidade } from "@/components/admin/PreviaIdentidade";
import type { ImovelPrevia } from "@/lib/previa-identidade-data";
import {
  CANAIS_PUBLICOS,
  LIMITE_HORARIO_ATENDIMENTO,
  type ChaveCanal,
  type ConfiguracaoCanais,
  type ConfiguracaoHorario,
} from "@/lib/contatos-publicos";
import { LogoUpload } from "@/components/admin/LogoUpload";
import { LogoRodapeUpload } from "@/components/admin/LogoRodapeUpload";
import { FaviconUpload } from "@/components/admin/FaviconUpload";
import { SeletorTema } from "@/components/admin/SeletorTema";
import { SeletorAparenciaRodape } from "@/components/admin/SeletorAparenciaRodape";
import { GeradorTemaLogotipo } from "@/components/admin/GeradorTemaLogotipo";
import { HeroImageUpload } from "@/components/admin/HeroImageUpload";
import { resolverTemaEfetivo, THEME_ID_CUSTOMIZADO, type TokensTema } from "@/lib/branding/temas";
import type { GrupoFusos } from "@/lib/fusos-opcoes";

// Exemplos de preenchimento, um por canal — nenhum aponta para uma marca
// real: são sempre "suaimobiliaria".
const PLACEHOLDERS: Record<ChaveCanal, string> = {
  telefone: "+55 (11) 3888-3000",
  whatsapp: "5511999998888 (DDI + DDD + número, só dígitos)",
  instagram: "https://instagram.com/suaimobiliaria",
  facebook: "https://facebook.com/suaimobiliaria",
  linkedin: "https://linkedin.com/company/suaimobiliaria",
  youtube: "https://youtube.com/@suaimobiliaria",
  tiktok: "https://tiktok.com/@suaimobiliaria",
};

type ConfiguracaoInicial = {
  telefone: string;
  whatsapp: string;
  email: string;
  instagram: string;
  facebook: string;
  youtube: string;
  linkedin: string;
  tiktok: string;
  canais: ConfiguracaoCanais;
  horario: ConfiguracaoHorario;
  corBarraTopo: string | null;
  codigoImovelPrefixo: string;
  logo: string | null;
  logoAltura: number;
  logoRodape: string | null;
  logoRodapeAltura: number;
  heroImage: string | null;
  themeId: string | null;
  favicon: string | null;
  nomePublico: string | null;
  // Fase 62 — dados REAIS que a prévia do site mostra. Resolvidos no
  // servidor para o tenant da sessão (ver ConfiguracoesPage): o nome da
  // organização como último recurso do rótulo, a imagem do hero já com o
  // fallback aplicado, e os imóveis publicados.
  nomeOrganizacao: string;
  heroPrevia: string | null;
  imoveisPrevia: ImovelPrevia[];
  footerAppearance: string | null;
  temaCustomizado: TokensTema | null;
  // Fase 18 — fuso horário comercial já resolvido (nunca null aqui: a
  // página aplica o fallback explícito antes de entregar).
  fuso: string;
  gruposDeFuso: GrupoFusos[];
  // Fase 22 — política de visibilidade comercial da organização.
  visibilidadeComercial: "COLLABORATIVE" | "RESTRICTED";
};

export function ConfiguracaoContatoForm({ config }: { config: ConfiguracaoInicial }) {
  const [estado, formAction, pendente] = useActionState(
    salvarConfiguracaoContato,
    ESTADO_INICIAL_ACAO
  );
  const resumoRef = useRef<HTMLDivElement>(null);

  // Fase 58.3 — SALVAMENTO É TUDO-OU-NADA: um único campo inválido
  // descarta o formulário inteiro, inclusive os campos corretos (há
  // teste de integração afirmando isso). O alerta que explica o motivo
  // fica no TOPO desta página longa, e o botão Salvar no fim — ou seja,
  // fora da tela no momento do clique. Quem salvava via a página não
  // mudar e concluía que tinha dado certo.
  //
  // Levar foco e rolagem ao resumo transforma uma falha silenciosa em
  // uma falha visível. Não muda regra de validação nenhuma.
  useEffect(() => {
    if (estado.success || !estado.message) return;
    const el = resumoRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.focus();
  }, [estado]);

  return (
    <form action={formAction} className="space-y-5">
      {estado.message && !estado.success && (
        <Alert
          ref={resumoRef}
          variant="destructive"
          // tabIndex -1: recebe foco por programa (para o leitor de tela
          // anunciar o erro) sem entrar na ordem de tabulação.
          tabIndex={-1}
          role="alert"
          data-erro-configuracao
        >
          <AlertDescription>{estado.message}</AlertDescription>
        </Alert>
      )}

      {/* O sucesso aparece no TOPO e também junto do botão (ver fim do
          formulário): quem clica em Salvar está olhando para o fim da
          página, não para o começo. */}
      {estado.success && estado.message && (
        <Alert data-sucesso-configuracao>
          <AlertDescription>{estado.message}</AlertDescription>
        </Alert>
      )}

      <AbasConfiguracoes
        abas={[
          {
            id: "geral",
            rotulo: "Geral",
            conteudo: (
              <>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="min-w-0 break-words">Informações gerais</CardTitle>
              <CardDescription className="min-w-0 break-words">
                Os dados básicos da sua imobiliária.
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
            </CardContent>
          </Card>

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
              </>
            ),
          },
          {
            id: "identidade",
            rotulo: "Identidade visual",
            conteudo: (
              <>
          {/* Duas colunas a partir de xl: a prévia fica ao lado dos
              controles, que é o que permite "alterei aqui, vejo ali".
              Abaixo disso ela vai para baixo — empilhar é melhor que
              espremer as pastilhas de tema. */}
          <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] xl:items-start">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle className="min-w-0 break-words">Identidade visual</CardTitle>
                <CardDescription className="min-w-0 break-words">
                  Como sua imobiliária aparece no site público.
                </CardDescription>
              </CardHeader>
              <CardContent className="min-w-0 space-y-6">
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
              </CardContent>
            </Card>
            <div className="min-w-0 xl:sticky xl:top-20">
              <Card className="min-w-0">
                <CardContent className="min-w-0 pt-6">
                  <PreviaIdentidade
                    temaInicial={config.themeId}
                    temaCustomizado={
                      config.temaCustomizado
                        ? resolverTemaEfetivo(THEME_ID_CUSTOMIZADO, config.temaCustomizado)
                        : null
                    }
                    logo={config.logo}
                    nomeFallback={config.nomePublico || config.nomeOrganizacao}
                    heroImagem={config.heroPrevia}
                    imoveis={config.imoveisPrevia}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
              </>
            ),
          },
          {
            id: "site",
            rotulo: "Site público",
            conteudo: (
              <>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="min-w-0 break-words">Site público</CardTitle>
              <CardDescription className="min-w-0 break-words">
                A imagem principal da Home, o rodapé e a faixa de contatos do topo.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 space-y-6">
              <HeroImageUpload heroImageInicial={config.heroImage} />

            <div className="min-w-0 border-t pt-6">
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

            <div className="min-w-0 border-t pt-6">
              <CorBarraTopo corInicial={config.corBarraTopo} />
            </div>
            </CardContent>
          </Card>
              </>
            ),
          },
          {
            id: "contatos",
            rotulo: "Contatos e redes",
            conteudo: (
              <>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="min-w-0 break-words">Contatos, redes sociais e atendimento</CardTitle>
              <CardDescription className="min-w-0 break-words">
                Escolha onde cada contato ou rede social será exibido no site público. Campos não preenchidos não serão exibidos.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0 space-y-4">
            {CANAIS_PUBLICOS.map((canal) => {
              const valores = config.canais[canal.chave];
              return (
                <div
                  key={canal.chave}
                  data-canal-config={canal.chave}
                  className="min-w-0 space-y-2 border-b pb-4 last:border-b-0 last:pb-0 sm:flex sm:items-start sm:gap-4 sm:space-y-0"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Label htmlFor={canal.chave}>{canal.rotulo}</Label>
                    <Input
                      id={canal.chave}
                      name={canal.chave === "telefone" ? "telefone" : canal.chave}
                      defaultValue={valores.valor}
                      placeholder={PLACEHOLDERS[canal.chave]}
                    />
                    <ErroCampo erros={estado.fieldErrors?.[canal.chave]} />
                  </div>
                  {/* CORREÇÃO — cada caixa carrega o próprio rótulo VISÍVEL,
                      em qualquer largura.
                    
                      A primeira versão desta tela escondia os dois rótulos
                      no desktop (`sm:sr-only`) e delegava a identificação a
                      uma fileira de títulos "Topo/Rodapé" no alto do card.
                      Duas caixas idênticas e sem texto, a dezenas de pixels
                      do único lugar que dizia o que eram — e o título
                      "Topo" ainda por cima caía 16px fora do eixo da sua
                      própria caixa (medido: título em x=1096..1160, caixa
                      em x=1112..1176), enquanto "Rodapé" alinhava exato.
                      Era possível marcar uma acreditando ter marcado a
                      outra, e o resultado disso é exatamente o defeito
                      relatado: rodapé configurado, topo não.
                    
                      Rótulo colado na caixa não depende de alinhamento
                      entre elementos distantes, então não tem como
                      desalinhar. */}
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:shrink-0 sm:pt-8">
                    <label
                      className="flex cursor-pointer items-center gap-2 text-sm"
                      data-flag={`${canal.chave}-topo`}
                    >
                      <Checkbox name={`${canal.chave}Topo`} defaultChecked={valores.topo} />
                      Topo
                    </label>
                    <label
                      className="flex cursor-pointer items-center gap-2 text-sm"
                      data-flag={`${canal.chave}-rodape`}
                    >
                      <Checkbox name={`${canal.chave}Rodape`} defaultChecked={valores.rodape} />
                      Rodapé
                    </label>
                  </div>
                </div>
              );
            })}

            {/* Fase 58.2 — horário de atendimento. Fica junto dos demais
                porque é configuração do MESMO lugar (a barra superior),
                mas sem par de caixas: só existe no topo, e inventar um
                "Exibir no rodapé" criaria uma opção que ninguém pediu. */}
            <div
              data-canal-config="horario"
              className="min-w-0 space-y-2 border-t pt-4 sm:flex sm:items-start sm:gap-4 sm:space-y-0"
            >
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="horarioAtendimento">Horário de atendimento</Label>
                <Input
                  id="horarioAtendimento"
                  name="horarioAtendimento"
                  defaultValue={config.horario.valor}
                  maxLength={LIMITE_HORARIO_ATENDIMENTO}
                  placeholder="Segunda a sexta, das 9h às 18h"
                />
                <ErroCampo erros={estado.fieldErrors?.horarioAtendimento} />
              </div>
              {/* Fase 58.3 — o horário ganhou o par completo, igual aos
                  demais canais. Cada caixa com o próprio rótulo visível,
                  como a correção da Fase 58 estabeleceu. */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:shrink-0 sm:pt-8">
                <label
                  className="flex cursor-pointer items-center gap-2 text-sm"
                  data-flag="horario-topo"
                >
                  <Checkbox
                    name="horarioAtendimentoTopo"
                    defaultChecked={config.horario.topo}
                  />
                  Topo
                </label>
                <label
                  className="flex cursor-pointer items-center gap-2 text-sm"
                  data-flag="horario-rodape"
                >
                  <Checkbox
                    name="horarioAtendimentoRodape"
                    defaultChecked={config.horario.rodape}
                  />
                  Rodapé
                </label>
              </div>
            </div>

            <div className="min-w-0 space-y-1.5 border-t pt-4">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={config.email}
                placeholder="contato@suaimobiliaria.com.br"
              />
              <p className="text-xs text-muted-foreground">
                Recebe as mensagens enviadas pelos formulários do site.
              </p>
              <ErroCampo erros={estado.fieldErrors?.email} />
            </div>
            </CardContent>
          </Card>
              </>
            ),
          },
          {
            id: "acesso",
            rotulo: "Equipe e acesso",
            conteudo: (
              <>
          {/* Visibilidade da carteira comercial (Fase 22). Fica junto do
              resto da configuração institucional — nenhuma tela nova, e o
              mesmo gate de OWNER/ADMIN que já protege esta página. */}
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle className="min-w-0 break-words">Visibilidade da carteira comercial</CardTitle>
              <CardDescription className="min-w-0 break-words">
                Define o que cada pessoa da equipe enxerga em Clientes, Pipeline e Agenda. Alterar
                esta opção não transfere nem apaga nada — muda apenas quem tem acesso.
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              {/* <fieldset> + <legend>: as duas opções são uma escolha única
                  e precisam ser anunciadas como grupo por leitor de tela. */}
              <fieldset className="min-w-0 space-y-3">
                <legend className="sr-only">Visibilidade da carteira comercial</legend>
                {[
                  {
                    valor: "COLLABORATIVE" as const,
                    titulo: "Compartilhada",
                    descricao:
                      "Todos os usuários com acesso ao CRM visualizam a carteira da organização.",
                  },
                  {
                    valor: "RESTRICTED" as const,
                    titulo: "Restrita",
                    descricao:
                      "Corretores visualizam apenas os clientes, negociações e compromissos da própria carteira. Gestores mantêm a visão da organização.",
                  },
                ].map((opcao) => (
                  <label
                    key={opcao.valor}
                    htmlFor={`visibilidade-${opcao.valor}`}
                    className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                  >
                    <input
                      type="radio"
                      id={`visibilidade-${opcao.valor}`}
                      name="visibilidadeComercial"
                      value={opcao.valor}
                      defaultChecked={config.visibilidadeComercial === opcao.valor}
                      className="mt-1 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{opcao.titulo}</span>
                      <span className="block text-sm text-muted-foreground">{opcao.descricao}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <ErroCampo erros={estado.fieldErrors?.visibilidadeComercial} />
            </CardContent>
          </Card>
              </>
            ),
          },
        ]}
      />

      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="lg"
          disabled={pendente}
          className="h-auto min-h-9 min-w-0 shrink whitespace-normal"
        >
          {pendente ? "Salvando..." : "Salvar alterações"}
        </Button>
        {/* Feedback ao lado do botão — onde os olhos estão no momento do
            clique. `role="status"` para ser anunciado sem roubar foco. */}
        {estado.message && (
          <p
            role="status"
            data-feedback-salvar
            className={`min-w-0 break-words text-sm ${
              estado.success ? "text-muted-foreground" : "text-destructive"
            }`}
          >
            {estado.message}
          </p>
        )}
      </div>
    </form>
  );
}
