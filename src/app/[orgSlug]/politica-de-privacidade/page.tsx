import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrganizationBySlug } from "@/lib/tenant";
import { buscarBranding } from "@/lib/branding";
import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { resolverBasePath } from "@/lib/site-url";
import { withOrganization } from "@/lib/tenant-context";
import { metadataPaginaPublica } from "@/lib/seo";
import { caminhoPoliticaPrivacidade } from "@/lib/politica-privacidade";
import { TITULO_PAGINA, TITULO_BLOCO } from "@/lib/site-typography";
import { formatarTelefone } from "@/lib/telefone";
import { hrefTelefone } from "@/lib/perfil-publico-corretor";
import { linkWhatsApp } from "@/lib/whatsapp";

// =======================================================================
// Política de Privacidade (Fase 51)
// =======================================================================
// Página pública por organização: quem recebe e responde um contato do
// site é a IMOBILIÁRIA anunciante, não a plataforma — e o texto diz isso
// com o nome dela e com os canais que ela publicou.
//
// O conteúdo descreve o que a aplicação FAZ HOJE, verificado no código:
// formulários públicos (nome, telefone, e-mail, mensagem e o imóvel de
// origem), IP usado só para conter abuso, identificador aleatório do
// navegador para contar visualizações e cliques de WhatsApp, origem da
// visita guardada na sessão do navegador, favoritos que nunca saem do
// navegador, e os serviços que a operação exige (hospedagem, banco de
// dados, envio de e-mail, monitoramento de erros, armazenamento de
// imagens, mapa e vídeo incorporados).
//
// O que NÃO está aqui, de propósito: prazo de retenção, base legal
// específica por tratamento, encarregado/DPO e canal exclusivo de
// privacidade. Nada disso existe configurado no produto, e afirmar
// qualquer um deles seria inventar. O pedido do titular usa os canais
// públicos reais da organização.

const ATUALIZADA_EM = "17 de setembro de 2026";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) return {};
  const nome = (await buscarBranding(organization.id)).displayName ?? organization.name;
  return metadataPaginaPublica({
    title: "Política de Privacidade",
    description: `Como ${nome} trata os dados informados no site.`,
    path: caminhoPoliticaPrivacidade(resolverBasePath(orgSlug)),
    siteName: nome,
  });
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className={TITULO_BLOCO}>{titulo}</h2>
      {children}
    </section>
  );
}

export default async function PoliticaDePrivacidadePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const organization = await getOrganizationBySlug(orgSlug);
  if (!organization) notFound();
  const organizationId = organization.id;
  const basePath = resolverBasePath(orgSlug);

  // As duas consultas que a página precisa, juntas — as mesmas fontes
  // (cacheadas por organização) que o cabeçalho e o rodapé já usam.
  const [config, branding] = await withOrganization(organizationId, () =>
    Promise.all([buscarConfiguracaoContato(organizationId), buscarBranding(organizationId)])
  );
  const nome = branding.displayName ?? organization.name;
  const whatsappHref = linkWhatsApp(config.whatsapp, "");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className={TITULO_PAGINA}>Política de Privacidade</h1>
      <p className="mt-2 text-sm text-gray-500">Última atualização: {ATUALIZADA_EM}</p>

      {/* max-w-prose + leading-relaxed: linha curta o bastante para leitura
          corrida em qualquer largura, sem página de texto esticada. */}
      <div className="mt-8 max-w-prose space-y-8 leading-relaxed text-gray-700">
        <Secao titulo="1. Sobre esta política">
          <p>
            Este site apresenta os imóveis anunciados por {nome} e permite que você entre em
            contato sobre eles. Esta página explica quais informações podem ser coletadas aqui,
            para que elas são usadas e como pedir acesso, correção ou exclusão.
          </p>
          <p>
            Quando você envia uma solicitação pelo site, quem recebe e responde é {nome}. O site é
            publicado com a plataforma easymob, que hospeda e mantém o sistema em nome da
            imobiliária.
          </p>
        </Secao>

        <Secao titulo="2. Dados que podem ser coletados">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Dados que você informa nos formulários:</strong> nome, telefone, e-mail e a
              mensagem escrita. Quando o formulário parte da página de um imóvel, guardamos também
              qual imóvel originou o contato.
            </li>
            <li>
              <strong>Dados de quem anuncia um imóvel conosco:</strong> os mesmos dados de contato,
              mais as informações do imóvel que você descrever no formulário.
            </li>
            <li>
              <strong>Endereço de IP e horário do envio:</strong> usados no momento do envio para
              conter automação e envios repetidos. Não ficam guardados junto do seu cadastro.
            </li>
            <li>
              <strong>Uso do site:</strong> um identificador aleatório é gerado no seu navegador
              para contar visualizações de imóveis e cliques nos botões de WhatsApp, sem nome nem
              e-mail associados. A origem da visita (endereço que trouxe você e parâmetros de
              campanha, quando existirem) fica guardada apenas na sessão do navegador e acompanha o
              contato, se você enviar um.
            </li>
            <li>
              <strong>Imóveis salvos:</strong> a lista de favoritos fica somente no seu navegador e
              não é enviada para nós.
            </li>
          </ul>
        </Secao>

        <Secao titulo="3. Como utilizamos os dados">
          <p>
            As informações que você fornece são utilizadas para responder ao seu contato e dar
            continuidade ao atendimento sobre o imóvel de seu interesse. Para isso, o contato é
            registrado no sistema de atendimento de {nome}, o que também evita que a mesma pessoa
            seja cadastrada em duplicidade a cada nova mensagem.
          </p>
          <p>
            Os dados de uso do site servem para entender quais anúncios recebem mais interesse. Não
            usamos as informações enviadas aqui para publicidade de terceiros e não as vendemos.
          </p>
        </Secao>

        <Secao titulo="4. Atendimento e contato imobiliário">
          <p>
            Ao enviar uma mensagem, você pode ser contatado por {nome} pelos meios que informou —
            telefone, WhatsApp ou e-mail — sobre o imóvel em questão e sobre o andamento do
            atendimento. Se você preferir não receber mais contato, basta dizer isso à equipe pelo
            mesmo canal.
          </p>
          <p>
            Os botões de WhatsApp do site abrem uma conversa no aplicativo ou no site do WhatsApp.
            A partir daí, a conversa passa a ser tratada também pelas regras do WhatsApp.
          </p>
        </Secao>

        <Secao titulo="5. Compartilhamento e operadores necessários">
          <p>
            Os dados enviados ficam disponíveis para a equipe de {nome} dentro do sistema. Além
            disso, a operação do site depende de serviços de terceiros, que tratam os dados apenas
            para que o sistema funcione:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>hospedagem da aplicação e banco de dados onde as informações ficam armazenadas;</li>
            <li>serviço de envio de e-mail, usado para avisar a equipe sobre novos contatos;</li>
            <li>serviço de monitoramento de erros, que registra falhas técnicas da aplicação;</li>
            <li>armazenamento das imagens e dos materiais publicados nos anúncios;</li>
            <li>
              mapa e vídeos incorporados de serviços externos (Google Maps e YouTube) nas páginas de
              imóveis que os utilizam. Ao carregar esses conteúdos, o navegador se comunica
              diretamente com esses serviços, que possuem políticas próprias.
            </li>
          </ul>
          <p>
            Também podemos compartilhar informações quando houver obrigação legal ou solicitação de
            autoridade competente.
          </p>
        </Secao>

        <Secao titulo="6. Cookies e tecnologias utilizadas">
          <p>
            As páginas públicas deste site não usam cookies de publicidade nem de redes sociais. O
            que existe é armazenamento no próprio navegador: o identificador aleatório de uso, a
            origem da visita (que dura até você fechar a aba) e a sua lista de imóveis salvos.
          </p>
          <p>
            Cookies são usados na área restrita do sistema, para manter a sessão de quem faz login —
            o que não se aplica a quem apenas navega pelos anúncios.
          </p>
        </Secao>

        <Secao titulo="7. Armazenamento e segurança">
          <p>
            Os dados ficam armazenados em serviços contratados para a operação do sistema, com
            acesso restrito à equipe da imobiliária e ao pessoal técnico responsável pela
            manutenção. O acesso ao sistema exige autenticação, e as páginas são servidas por
            conexão criptografada.
          </p>
          <p>
            Nenhum sistema é totalmente imune a incidentes, e não prometemos segurança absoluta. As
            informações de atendimento são mantidas enquanto forem necessárias ao relacionamento
            comercial e ao cumprimento de obrigações legais aplicáveis.
          </p>
        </Secao>

        <Secao titulo="8. Direitos do titular">
          <p>
            A Lei Geral de Proteção de Dados assegura a você, entre outros direitos, confirmar se
            tratamos dados a seu respeito, acessá-los, corrigir informações incompletas ou
            desatualizadas, pedir a exclusão daquilo que não precisamos manter e se opor a
            tratamentos com os quais não concorde.
          </p>
        </Secao>

        <Secao titulo="9. Como solicitar acesso, correção ou exclusão">
          <p>
            Basta pedir por qualquer um dos canais de contato de {nome} abaixo, informando o que
            deseja. A equipe responderá pelo mesmo canal.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            {config.email && (
              <li>
                E-mail:{" "}
                <a className="text-link underline underline-offset-2 hover:no-underline" href={`mailto:${config.email}`}>
                  {config.email}
                </a>
              </li>
            )}
            {config.telefone && (
              <li>
                Telefone:{" "}
                <a
                  className="text-link underline underline-offset-2 hover:no-underline"
                  href={hrefTelefone(config.telefone.replace(/\D/g, ""))!}
                >
                  {formatarTelefone(config.telefone)}
                </a>
              </li>
            )}
            {whatsappHref && (
              <li>
                WhatsApp:{" "}
                <a
                  className="text-link underline underline-offset-2 hover:no-underline"
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {formatarTelefone(config.whatsapp)}
                </a>
              </li>
            )}
            <li>
              Formulário de contato:{" "}
              <Link className="text-link underline underline-offset-2 hover:no-underline" href={`${basePath}/contato`}>
                página de contato
              </Link>
              .
            </li>
          </ul>
        </Secao>

        <Secao titulo="10. Alterações desta política">
          <p>
            Esta política pode ser atualizada para refletir mudanças no site ou na forma como o
            atendimento funciona. A data da última atualização fica sempre no topo desta página.
          </p>
        </Secao>

        <Secao titulo="11. Como entrar em contato">
          <p>
            Dúvidas sobre esta política ou sobre o uso dos seus dados podem ser enviadas para {nome}{" "}
            pelos canais listados no item 9.
          </p>
        </Secao>
      </div>
    </div>
  );
}
