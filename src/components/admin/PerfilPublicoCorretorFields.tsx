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
}: {
  valores: {
    publicado: boolean;
    creci: string | null;
    foto: string | null;
    bio: string | null;
    whatsapp: string | null;
  };
  erros?: Record<string, string[] | undefined>;
}) {
  return (
    <fieldset className="space-y-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">Perfil público</legend>
      <p className="text-xs text-muted-foreground">
        Identidade comercial exibida no site público, nos imóveis em que
        esta pessoa é a responsável. Nada aqui aparece no site enquanto a
        exibição não for marcada abaixo — e os dados internos do painel
        (e-mail de acesso, WhatsApp e e-mail operacionais) nunca são
        publicados.
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
    </fieldset>
  );
}

function ErroCampo({ erros }: { erros?: string[] }) {
  if (!erros?.length) return null;
  return <p className="text-xs text-destructive">{erros[0]}</p>;
}
