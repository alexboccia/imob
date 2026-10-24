# Fase 139 — últimas páginas do padrão visual (acento azul)

Status: implementado, testado e publicado. Levantamento final: nenhuma
página administrativa do backoffice ficou de fora depois desta fase.

## Contexto

Com o Dashboard concluído (Fase 138), foi feito um levantamento
sistemático de toda a área `/app` (via grep por `CardTitle` e por
`CabecalhoSecao` sem `tom="azul"`) para confirmar se restava alguma
página sem o padrão. Restavam 3 gaps reais:

1. `/app/imoveis` e `/app/imoveis/[id]` — já usavam `CabecalhoSecao`,
   mas sem `tom="azul"` (o formulário de edição do imóvel, dentro da
   mesma página, já tinha sido migrado na Fase 129 — só os cabeçalhos
   fora do formulário ficaram de fora).
2. `/app/manutencao` — nunca migrado, ainda em `CardTitle`.
3. `/app/configuracoes` — nunca migrado: 6 cards em `ConfiguracaoContatoForm`
   (dentro de abas) + 1 em `ComissaoConfiguracaoForm`, todos em
   `CardTitle`/`CardHeader`.

Páginas auxiliares sem sidebar (login, recuperar-senha, convite) e o
card genérico `ModuloBloqueado` (aviso de módulo bloqueado por plano,
sem ícone) foram deliberadamente deixados de fora — não são páginas de
conteúdo do backoffice no mesmo sentido das demais.

## O que mudou

| Arquivo | Mudança |
|---|---|
| `src/app/app/imoveis/page.tsx` | `tom="azul"` em "Portfólio de imóveis" |
| `src/app/app/imoveis/[id]/page.tsx` | `tom="azul"` em "Clientes compatíveis" e "Clientes interessados" |
| `src/app/app/manutencao/page.tsx` | migrado de `CardTitle` para `CabecalhoSecao`, ícone `Trash2` |
| `src/components/admin/ComissaoConfiguracaoForm.tsx` | migrado de `CardTitle` para `CabecalhoSecao`, ícone `Percent` |
| `src/components/admin/ConfiguracaoContatoForm.tsx` | 6 seções migradas de `CardTitle` para `CabecalhoSecao`: Informações gerais (`Building2`), Código do imóvel (`Hash`), Identidade visual (`Palette`), Site público (`Monitor`), Contatos/redes/atendimento (`Share2`), Visibilidade da carteira comercial (`ShieldCheck`) |

Nenhuma mudança de dado, cálculo, query, validação ou permissão em
nenhum arquivo — puramente estrutural/visual, mesmo padrão das fases
anteriores (`<section><CabecalhoSecao tom="azul" /><Card><CardContent>`).

## Testes e correções de locator

- `npx tsc --noEmit` — sem erros.
- `npx eslint` nos arquivos tocados — sem erros.
- `npm run build` — sem erros.
- `npx vitest run` — 3895/3895 passando.
- E2E: `configuracoes.spec.ts`, `imoveis.spec.ts`, `manutencao.spec.ts`,
  `ficha-imovel-secoes.spec.ts`, `relacionar-cliente-imovel.spec.ts`,
  `relacionar-imovel-cliente.spec.ts` — 158/158 passando após 2 ajustes
  de locator, consequência direta da migração estrutural (mesmo padrão
  de toda a série):
  - `manutencao.spec.ts` — `[data-slot="card-title"]` → `getByRole("heading", { level: 2 })`.
  - `configuracoes.spec.ts` (teste de largura em 1440px) — o card de
    "Identidade visual" não tem mais `card-title` dentro dele (o título
    virou `CabecalhoSecao`, fora do Card); passou a localizar a
    `<section>` pelo heading e pegar o primeiro `[data-slot="card"]`
    dentro dela.
- `busca-global.spec.ts` ("Registrar interação" pula pro topo sem
  passar pela ficha) falhou, mas é **pré-existente e não relacionado**:
  confirmado via `git stash` + rebuild + rerun contra HEAD limpo
  (2/2 falhas idênticas, mesmo sem nenhuma mudança desta fase).

## Evidência visual

`evidencias/139-imoveis.png`, `139-manutencao.png`,
`139-configuracoes-geral.png`, `139-configuracoes-identidade.png`,
`139-configuracoes-acesso.png` — todos os cabeçalhos de seção com
ícone azul, no lugar dos antigos `CardTitle`.
