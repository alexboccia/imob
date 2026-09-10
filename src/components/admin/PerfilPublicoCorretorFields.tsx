"use client";

import { FotoCorretorUpload } from "@/components/admin/FotoCorretorUpload";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LIMITE_BIO_PUBLICA } from "@/lib/perfil-publico-limites";

// Seção "Perfil público" do formulário de edição de usuário. O que ela
// existe pra deixar explícito na tela: publicar é uma DECISÃO, não uma
// consequência de ter cadastro. Por isso o checkbox vem primeiro, com o
// texto dizendo o que acontece — e os campos abaixo continuam editáveis
// mesmo com ele desmarcado, pra dar pra montar o perfil antes de
// publicar (e despublicar depois sem perder o que foi escrito).
export function PerfilPublicoCorretorFields({
  valores,
  erros,
  perfilPublicoHref,
  pastaDaFoto,
}: {
  valores: {
    publicado: boolean;
    creci: string | null;
    foto: string | null;
    bio: string | null;
    whatsapp: string | null;
    telefone: string | null;
    email: string | null;
  };
  erros?: Record<string, string[] | undefined>;
  /**
   * Endereço real do perfil no site — só chega preenchido quando o
   * perfil está publicado. Com a exibição desmarcada a rota devolve 404,
   * então não existe link para lugar nenhum: nada de CTA que termina em
   * página de erro.
   */
  perfilPublicoHref?: string | null;
  /** Repassada ao upload: "perfil" na autogestão, "usuarios" na admin. */
  pastaDaFoto?: "usuarios" | "perfil";
}) {
  return (
    // min-w-0: o navegador dá a todo <fieldset> um min-width intrínseco
    // (min-content), então ele se recusa a encolher e estoura a largura
    // do container no mobile — o texto de privacidade, que é longo de
    // propósito, define esse mínimo. Sem isto a seção vazava para fora da
    // tela em 390px na autogestão, e vazava para dentro do scroll
    // horizontal do painel na tela de administração.
    <fieldset className="min-w-0 space-y-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">Perfil público</legend>
      <p className="text-xs text-muted-foreground">
        Identidade comercial exibida no site público: na página deste
        profissional e nos imóveis em que ele é o responsável. Nada aqui
        aparece no site enquanto a exibição não for marcada abaixo — e os
        dados internos do painel (e-mail de acesso, WhatsApp e e-mail
        operacionais) nunca são publicados.
      </p>
      <p className="text-xs text-muted-foreground">
        Os contatos abaixo são separados dos operacionais: preencher um
        deles significa publicá-lo no site. Deixar em branco é não ter
        aquele contato público — e o botão correspondente deixa de existir.
      </p>

      {/* Checkbox envolvido pelo <label>, como o resto do formulário já
          faz: o primitivo do Base UI reatribui o id do controle, então
          `htmlFor` apontando pra ele não associa nem deixa clicável. */}
      <div className="space-y-0.5">
        <label
          className="flex items-start gap-2.5 text-sm font-medium"
          data-testid="perfil-publico-ativo"
        >
          <Checkbox
            name="perfilPublicoAtivo"
            defaultChecked={valores.publicado}
            className="mt-0.5"
          />
          Exibir este profissional no site público
        </label>
        <p className="pl-6 text-xs text-muted-foreground">
          Ao desmarcar, o site volta a mostrar apenas os dados da
          imobiliária. As informações preenchidas abaixo continuam salvas.
        </p>
      </div>

      <FotoCorretorUpload
        fotoInicial={valores.foto}
        pasta={pastaDaFoto}
        name="perfilPublicoFoto"
        label="Foto pública (opcional)"
        alt="Foto pública do profissional"
        descricao="Aparece no site. É separada da foto usada no painel."
      />

      <div className="space-y-1.5">
        <Label htmlFor="perfilPublicoCreci">CRECI (opcional)</Label>
        <Input
          id="perfilPublicoCreci"
          name="perfilPublicoCreci"
          defaultValue={valores.creci ?? ""}
          placeholder="Ex: CRECI 00.000-F"
          aria-invalid={erros?.perfilPublicoCreci ? true : undefined}
        />
        <ErroCampo erros={erros?.perfilPublicoCreci} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="perfilPublicoBio">Apresentação (opcional)</Label>
        <Textarea
          id="perfilPublicoBio"
          name="perfilPublicoBio"
          rows={4}
          maxLength={LIMITE_BIO_PUBLICA}
          defaultValue={valores.bio ?? ""}
          placeholder="Uma breve apresentação profissional, exibida no site."
          aria-invalid={erros?.perfilPublicoBio ? true : undefined}
        />
        <p className="text-xs text-muted-foreground">
          Até {LIMITE_BIO_PUBLICA} caracteres. Texto simples — formatação e
          links não são interpretados.
        </p>
        <ErroCampo erros={erros?.perfilPublicoBio} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="perfilPublicoWhatsapp">
          WhatsApp público (opcional)
        </Label>
        <Input
          id="perfilPublicoWhatsapp"
          name="perfilPublicoWhatsapp"
          defaultValue={valores.whatsapp ?? ""}
          placeholder="5511999998888 (DDI + DDD + número, só dígitos)"
          aria-invalid={erros?.perfilPublicoWhatsapp ? true : undefined}
        />
        <p className="text-xs text-muted-foreground">
          Número exibido no site. É separado do WhatsApp operacional acima,
          que nunca é publicado. Se vazio, os botões de WhatsApp dos imóveis
          usam o número da imobiliária (Configurações).
        </p>
        <ErroCampo erros={erros?.perfilPublicoWhatsapp} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="perfilPublicoTelefone">Telefone público (opcional)</Label>
        <Input
          id="perfilPublicoTelefone"
          name="perfilPublicoTelefone"
          defaultValue={valores.telefone ?? ""}
          placeholder="(11) 99999-9999"
          aria-describedby="perfilPublicoTelefone-ajuda"
          aria-invalid={erros?.perfilPublicoTelefone ? true : undefined}
        />
        <p id="perfilPublicoTelefone-ajuda" className="text-xs text-muted-foreground">
          Número para ligação, exibido no site. DDD + número. É separado do
          WhatsApp acima e do telefone da imobiliária.
        </p>
        <ErroCampo erros={erros?.perfilPublicoTelefone} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="perfilPublicoEmail">E-mail público (opcional)</Label>
        <Input
          id="perfilPublicoEmail"
          name="perfilPublicoEmail"
          type="email"
          defaultValue={valores.email ?? ""}
          placeholder="nome@imobiliaria.com.br"
          aria-describedby="perfilPublicoEmail-ajuda"
          aria-invalid={erros?.perfilPublicoEmail ? true : undefined}
        />
        <p id="perfilPublicoEmail-ajuda" className="text-xs text-muted-foreground">
          Endereço exibido no site. Nunca é o e-mail de acesso ao painel,
          que continua privado.
        </p>
        <ErroCampo erros={erros?.perfilPublicoEmail} />
      </div>

      {perfilPublicoHref && (
        <p className="text-xs">
          <a
            href={perfilPublicoHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-link hover:underline"
            data-testid="ver-perfil-publico"
          >
            Ver este perfil no site
          </a>{" "}
          <span className="text-muted-foreground">
            — abre a página pública real, como o visitante a vê.
          </span>
        </p>
      )}
    </fieldset>
  );
}

function ErroCampo({ erros }: { erros?: string[] }) {
  if (!erros?.length) return null;
  return <p className="text-xs text-destructive">{erros[0]}</p>;
}
