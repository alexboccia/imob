"use client";

import { useActionState } from "react";
import { atualizarUsuario } from "@/app/app/usuarios/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { CardIdentificacaoUsuario } from "@/components/admin/usuarios/CardIdentificacaoUsuario";
import { CardContatoOperacional } from "@/components/admin/usuarios/CardContatoOperacional";
import { CardPerfilPublico } from "@/components/admin/perfil-publico/CardPerfilPublico";
import { CardFotoPublica } from "@/components/admin/perfil-publico/CardFotoPublica";
import { CardContatosPublicos } from "@/components/admin/perfil-publico/CardContatosPublicos";
import { CardApresentacao } from "@/components/admin/perfil-publico/CardApresentacao";
import { CardAcessoPermissoes } from "@/components/admin/usuarios/CardAcessoPermissoes";
import { RodapeSalvarPerfilPublico } from "@/components/admin/perfil-publico/RodapeSalvarPerfilPublico";

// Fase 131 — mesmo design system da Fase 129/130 (cards por assunto,
// ícone azul, switch) aplicado à gestão de usuários. Reaproveita os
// MESMOS 4 cards de perfil público que "Meu perfil público" usa — nunca
// duplicado, só promovido para `perfil-publico/` (ver Fase 130). Mesma
// action/schema/validação de sempre; nenhuma regra de autorização,
// permissão ou persistência mudou.
export function EditarUsuarioForm({
  usuario,
  ehVoceMesmo,
  podeGerenciarOwner,
  perfilPublicoHref,
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
    perfilPublico: {
      publicado: boolean;
      creci: string | null;
      foto: string | null;
      bio: string | null;
      whatsapp: string | null;
      telefone: string | null;
      email: string | null;
    };
  };
  ehVoceMesmo: boolean;
  podeGerenciarOwner: boolean;
  /** Endereço público do perfil — null quando ele não está publicado. */
  perfilPublicoHref?: string | null;
}) {
  const atualizarComId = atualizarUsuario.bind(null, usuario.id);
  const [estado, formAction, pendente] = useActionState(
    atualizarComId,
    ESTADO_INICIAL_ACAO
  );

  return (
    <form action={formAction} className="space-y-4">
      <CardIdentificacaoUsuario
        email={usuario.email}
        nome={usuario.nome}
        foto={usuario.foto}
        erroNome={estado.fieldErrors?.nome}
      />

      <CardContatoOperacional
        whatsapp={usuario.whatsapp}
        emailContato={usuario.emailContato}
        erros={estado.fieldErrors}
      />

      <CardPerfilPublico publicado={usuario.perfilPublico.publicado} />
      <CardFotoPublica foto={usuario.perfilPublico.foto} />
      <CardContatosPublicos
        valores={{
          creci: usuario.perfilPublico.creci,
          whatsapp: usuario.perfilPublico.whatsapp,
          telefone: usuario.perfilPublico.telefone,
          email: usuario.perfilPublico.email,
        }}
        erros={estado.fieldErrors}
      />
      <CardApresentacao
        bio={usuario.perfilPublico.bio}
        erro={estado.fieldErrors?.perfilPublicoBio}
        perfilPublicoHref={perfilPublicoHref ?? null}
        mensagem={null}
        pendente={pendente}
        rodape={false}
      />

      <CardAcessoPermissoes
        papel={usuario.papel}
        ativo={usuario.ativo}
        ehVoceMesmo={ehVoceMesmo}
        podeGerenciarOwner={podeGerenciarOwner}
        erroPapel={estado.fieldErrors?.papel}
        erroNovaSenha={estado.fieldErrors?.novaSenha}
      />

      <RodapeSalvarPerfilPublico
        perfilPublicoHref={perfilPublicoHref ?? null}
        mensagem={
          !estado.success && estado.message
            ? { texto: estado.message, sucesso: false }
            : null
        }
        pendente={pendente}
      />
    </form>
  );
}
