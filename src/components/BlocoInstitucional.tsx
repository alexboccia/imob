import Image from "next/image";
import Link from "next/link";
import {
  IconeEmail,
  IconeTelefone,
  IconeWhatsApp,
} from "@/components/icons";
import {
  IconeInstagram,
  IconeFacebook,
  IconeYoutube,
  IconeLinkedin,
} from "@/components/icones-sociais";
// Mesmo motivo de SecaoCaptacao.tsx: link de navegação com aparência de
// botão, não role="button".
import { buttonVariants } from "@/components/ui/button";
import { TITULO_SECAO } from "@/lib/site-typography";
import { larguraCaixaLogo } from "@/lib/logo";
import { linkWhatsApp } from "@/lib/whatsapp";

// Bloco de autoridade da Home. É INSTITUCIONAL (a imobiliária), não um
// perfil de corretor, por uma razão de dados e não de layout: o schema
// atual não tem onde marcar "este é o corretor que aparece no site" nem
// onde guardar CRECI, foto pública ou apresentação. OrganizationMember
// tem whatsapp/contactEmail e User tem name/avatarUrl, mas escolher um
// membro administrativo por conta própria e publicar nome e foto dele no
// site seria inventar uma decisão de produto — e expor dado pessoal que
// ninguém autorizou. Perfil de corretor fica para uma fase com campo
// próprio (ver relatório).
//
// Tudo aqui sai de dado REAL do tenant (OrganizationBranding.displayName
// / Organization.name, OrganizationSettings). Cada canal só aparece se
// estiver configurado; sem nenhum canal, resta o nome e o link pra
// /contato, que é rota pública real e sempre existe.

type Redes = {
  instagram?: string | null;
  facebook?: string | null;
  youtube?: string | null;
  linkedin?: string | null;
};

const REDES = [
  { chave: "instagram" as const, Icone: IconeInstagram, label: "Instagram" },
  { chave: "facebook" as const, Icone: IconeFacebook, label: "Facebook" },
  { chave: "youtube" as const, Icone: IconeYoutube, label: "YouTube" },
  { chave: "linkedin" as const, Icone: IconeLinkedin, label: "LinkedIn" },
];

function Canal({
  href,
  externo,
  Icone,
  rotulo,
  valor,
  corChip = "bg-primary/10 text-primary",
}: {
  href: string;
  externo?: boolean;
  Icone: (props: { className?: string }) => React.ReactElement;
  rotulo: string;
  valor: string;
  corChip?: string;
}) {
  return (
    <li className="min-w-0">
      <a
        href={href}
        target={externo ? "_blank" : undefined}
        rel={externo ? "noopener noreferrer" : undefined}
        className="flex min-w-0 items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary hover:bg-primary/5 focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
      >
        <span
          aria-hidden
          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${corChip}`}
        >
          <Icone className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-gray-500">{rotulo}</span>
          <span className="block truncate text-sm font-medium text-gray-900">
            {valor}
          </span>
        </span>
      </a>
    </li>
  );
}

export function BlocoInstitucional({
  nome,
  logo,
  logoAltura,
  telefone,
  email,
  whatsapp,
  redesSociais,
  basePath,
}: {
  nome: string;
  logo?: string | null;
  logoAltura?: number | null;
  telefone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  redesSociais?: Redes;
  basePath: string;
}) {
  const hrefWhatsApp = linkWhatsApp(
    whatsapp,
    `Olá! Encontrei o site da ${nome} e gostaria de mais informações.`
  );
  const telefoneLimpo = (telefone ?? "").replace(/\D/g, "");
  const emailLimpo = (email ?? "").trim();

  const redes = REDES.filter(({ chave }) => {
    const url = redesSociais?.[chave];
    return typeof url === "string" && url.trim() !== "";
  });

  const altura = logoAltura && logoAltura > 0 ? logoAltura : 48;

  return (
    <section className="mx-auto max-w-6xl px-4 py-12">
      <div className="rounded-2xl border bg-background p-6 sm:p-10">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
          <div className="min-w-0 lg:flex-1">
            {logo ? (
              <span
                className="relative block"
                style={{ height: altura, width: larguraCaixaLogo(altura) }}
              >
                <Image
                  src={logo}
                  alt={nome}
                  fill
                  sizes={`${larguraCaixaLogo(altura)}px`}
                  className="object-contain object-left"
                />
              </span>
            ) : null}

            <h2 className={`${TITULO_SECAO} ${logo ? "mt-5" : ""}`}>
              Atendimento {nome}
            </h2>
            <p className="mt-3 max-w-prose text-base text-gray-600">
              Fale com a equipe para agendar uma visita, tirar dúvidas sobre um
              anúncio ou avaliar um imóvel.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href={`${basePath}/contato`}
                className={buttonVariants()}
              >
                Entrar em contato
              </Link>
              {redes.length > 0 && (
                <ul className="flex items-center gap-2">
                  {redes.map(({ chave, Icone, label }) => (
                    <li key={chave}>
                      <a
                        href={redesSociais![chave]!}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`${label} de ${nome}`}
                        className="flex size-9 items-center justify-center rounded-full border text-gray-600 transition-colors hover:border-primary hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
                      >
                        <Icone className="size-4" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {(hrefWhatsApp || telefoneLimpo || emailLimpo) && (
            <ul className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:w-80 lg:shrink-0 lg:grid-cols-1">
              {hrefWhatsApp && (
                <Canal
                  href={hrefWhatsApp}
                  externo
                  Icone={IconeWhatsApp}
                  rotulo="WhatsApp"
                  valor={whatsapp!.trim()}
                  // Verde da marca do WhatsApp, o mesmo token já usado no
                  // botão flutuante e no detalhe do imóvel — é a cor DO
                  // canal, não do tenant, então não sai do tema por isso.
                  corChip="bg-whatsapp-brand/10 text-whatsapp-brand"
                />
              )}
              {telefoneLimpo && (
                <Canal
                  href={`tel:+${telefoneLimpo}`}
                  Icone={IconeTelefone}
                  rotulo="Telefone"
                  valor={telefone!.trim()}
                />
              )}
              {emailLimpo && (
                <Canal
                  href={`mailto:${emailLimpo}`}
                  Icone={IconeEmail}
                  rotulo="E-mail"
                  valor={emailLimpo}
                />
              )}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
