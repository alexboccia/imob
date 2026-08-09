import type { Metadata } from "next";
import { ContatoForm } from "@/components/ContatoForm";
import { metadataPaginaPublica } from "@/lib/seo";
import { resolverBasePath } from "@/lib/site-url";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}): Promise<Metadata> {
  const { orgSlug } = await params;
  const basePath = resolverBasePath(orgSlug);
  return metadataPaginaPublica({
    title: "Contato",
    description:
      "Envie sua mensagem e um de nossos corretores retornará em breve.",
    path: `${basePath}/contato`,
  });
}

export default async function ContatoPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">Contato</h1>
      <p className="text-gray-500 mb-8">
        Envie sua mensagem e um de nossos corretores retornará em breve.
      </p>
      <ContatoForm orgSlug={orgSlug} />
    </div>
  );
}
