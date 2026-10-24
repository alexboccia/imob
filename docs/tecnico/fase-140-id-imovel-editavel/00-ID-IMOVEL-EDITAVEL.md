# Fase 140 — ID do imóvel editável

Status: implementado, testado e publicado.

## Contexto

O código do imóvel (`Property.code`, inteiro autoincrement, único por
organização) sempre foi só-leitura — gerado pelo banco na criação,
mostrado como "ID: ..." no resumo da edição, sem forma de corrigir se
alguém digitasse/importasse um número errado. O proprietário pediu um
campo editável na tela de edição.

Decisão de escopo, confirmada com o proprietário antes de implementar:
**editável só na edição, nunca na criação**. Na criação ("Novo imóvel")
o código ainda não existe — nasce do autoincrement do banco ao salvar
pela primeira vez — então o campo só faz sentido depois, quando há um
valor real para corrigir.

## O que mudou

| Arquivo | Mudança |
|---|---|
| `src/lib/property-mapper.ts` | novo campo `codigo` no `imovelSchema`: opcional (ausente na criação), inteiro positivo quando presente. Fora de `camposImovel()` de propósito — não faz sentido na criação, e quem decide a unicidade é a action |
| `src/app/app/imoveis/actions.ts` | nova função `resolverCodigo` (mesmo padrão de `resolverPosicaoDestaque`): checa se o número já pertence a outro imóvel da organização ANTES de gravar, com mensagem nomeando o imóvel ocupante. `atualizarImovel` passa `code: codigo.codigo` no update — `undefined` quando o campo não vem, que o Prisma trata como "não mexe no campo" |
| `src/components/admin/ImovelForm.tsx` | novo campo "ID do imóvel" na seção Identificação, visível só quando `edicao` está presente (nunca em "Novo imóvel"). Mostra o prefixo da organização como texto fixo ao lado do número editável |
| `src/app/app/imoveis/[id]/page.tsx` | passa `codigoImovelPrefixo` (de `buscarConfiguracaoContato`) para o formulário |

A garantia de unicidade de verdade continua sendo o índice
`@@unique([organizationId, code])` do banco — a checagem na action é só
para dar uma mensagem legível antes de tentar gravar (mesmo raciocínio
documentado em `resolverPosicaoDestaque` para a vitrine da Home).

## Testes

- `npx tsc --noEmit` — sem erros.
- `npx eslint` nos arquivos tocados — sem erros.
- `npm run build` — sem erros.
- `npx vitest run` — 3904/3904 passando (9 novos: 3 de schema em
  `property-mapper.test.ts`, 6 de integração em
  `tests/integration/codigo-imovel-editavel.test.ts`, cobrindo: editar
  com número livre, não enviar preserva o código atual, colisão com
  outro imóvel da mesma organização (mensagem nomeia o ocupante,
  nada muda de fato), reenviar o próprio código não é falso-positivo
  de colisão, mesmo número em organizações diferentes nunca colide, e
  número não positivo é recusado na validação antes de tocar o banco).
- E2E (`imoveis.spec.ts`, `cabecalho-imovel.spec.ts`,
  `ficha-imovel-secoes.spec.ts`, `navegacao-imoveis.spec.ts`) —
  92/92 passando, sem nenhuma alteração: o novo campo não interferiu em
  nenhuma estrutura existente.

## Evidência visual

`evidencias/140-id-imovel.png` — campo "ID do imóvel" na seção
Identificação da edição, com o prefixo da organização (`T179280158-`)
como texto fixo ao lado do número editável.
