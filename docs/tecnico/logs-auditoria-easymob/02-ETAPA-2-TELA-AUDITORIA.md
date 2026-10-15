# 02 — Etapa 2: tela de Logs de Auditoria

Checkpoint 2. HEAD inicial e final: `a570b6e` (inalterado — nenhum commit, push, deploy, migration ou alteração no Neon de produção).

## 1. Tela implementada e rota de acesso

**Rota**: `/app/auditoria`. Item de menu "Auditoria" adicionado à navegação lateral, entre "Assinatura" e "Manutenção" (mesmo grupo de itens administrativos), com ícone próprio (`History`, lucide-react).

A tela mostra, por evento: data/hora, usuário responsável, módulo (entidade), ação, identificador do registro afetado, e um resumo de detalhes (quando o `payload` existir). Filtros: usuário, módulo, ação (dropdowns) e período (dois campos de data). Paginação, ordenação cronológica (mais recente primeiro), estados de carregamento/vazio já cobertos pelo componente `DataTable` reaproveitado de todas as outras telas administrativas.

**Não implementado nesta etapa, conforme instrução explícita**: comparação visual de valores antes/depois (pertence à Etapa 3) — a coluna "Detalhes" já sabe reconhecer esse formato quando ele existir (mesma convenção `{campo}Antes`/`{campo}Depois` de `PlatformAuditLog`), mas nenhum evento de hoje usa esse formato ainda, então ela mostra os pares crus do `payload` (ex.: `name: Residencial Alpha`) para os eventos da Etapa 1.

## 2. Permissões aplicadas

Reaproveitado `PAPEIS_GESTAO_CONFIGURACOES` (`OWNER`/`ADMIN`) — mesmo conjunto já usado por `/app/configuracoes`, já coberto por 8+ testes em `src/lib/authorization.test.ts` (nenhum teste novo necessário para a regra em si). Nenhum papel novo foi criado.

O gate acontece **antes de qualquer consulta ao banco** (mesmo padrão de `/app/configuracoes/page.tsx`): um `BROKER`/`MANAGER`/`ASSISTANT` vê só a mensagem "Apenas administradores podem consultar os logs de auditoria da imobiliária." — nenhuma linha de `ActivityLog` é lida nesse caminho.

O item de menu também é filtrado pelo mesmo conjunto de papéis (`papeis: PAPEIS_GESTAO_CONFIGURACOES` no array de navegação) — um usuário sem permissão nem vê o link, mesmo padrão já usado por "Assinatura" e "Configurações".

## 3. Arquivos criados e modificados

| Arquivo | Tipo | Conteúdo |
|---|---|---|
| `src/app/app/auditoria/page.tsx` | Novo | A tela — gate de papel, consultas, montagem das linhas |
| `src/app/app/auditoria/columns.tsx` | Novo | Definição das colunas da tabela + resumo de `payload` |
| `src/app/app/auditoria/PeriodoFiltro.tsx` | Novo | Filtro de período (dois `<input type="date">`, parâmetros `de`/`ate` na URL) |
| `src/lib/listagens-admin-query.ts` | Modificado | Nova função `construirWhereAuditoria()`, mesmo padrão das outras 3 já existentes (`construirWhereImoveis`/`Clientes`/`Usuarios`) |
| `src/components/admin/icones-nav.ts` | Modificado | Novo ícone `auditoria` (`History`) |
| `src/app/app/layout.tsx` | Modificado | Novo item de navegação |
| `src/lib/listagens-admin-query.test.ts` | Modificado | +7 testes unitários para `construirWhereAuditoria` |
| `tests/integration/auditoria-tela.test.ts` | Novo | +7 testes de integração contra banco real |

## 4. Testes executados e resultados

### Unitários — `construirWhereAuditoria` (7 testes, `src/lib/listagens-admin-query.test.ts`)
`organizationId` sempre presente; organizações diferentes nunca produzem o mesmo `where`; filtros de usuário/módulo/ação aplicados corretamente; período com só início, só fim, os dois juntos, e data inválida/vazia (ignorada, nunca quebra) — incluindo o caso específico de "até" significar o **fim** do dia escolhido, não a meia-noite dele (confirmado com teste dedicado, já que um evento às 20h do último dia do período precisa ser incluído).

### Integração — `tests/integration/auditoria-tela.test.ts` (7 testes, banco real)

| # | Cenário | Resultado |
|---|---|---|
| 1 | Consulta de um tenant nunca retorna evento de outro, mesmo `entity`/`action` idênticos | Passou |
| 2 | Filtro por usuário não atravessa tenant **mesmo com o mesmo `userId` em duas organizações** (cenário de troca de organização, já suportado pelo projeto) | Passou |
| 3 | Filtro combinado módulo + ação restringe corretamente | Passou |
| 4 | Filtro de período exclui eventos fora da janela (testado com uma data forçada para 2020) | Passou |
| 5 | Paginação real (`skip`/`take`) contra o banco — páginas sem sobreposição, ordenação por mais recente | Passou |
| 6 | Evento `deleted` continua consultável mesmo com o registro original já não existindo mais | Passou |
| 7 | Nenhum `payload` gravado contém chaves de segredo (senha/token/cookie/secret) | Passou |

**Autorização de página**: não reimplementada em teste próprio — a regra (`temPapel`/`PAPEIS_GESTAO_CONFIGURACOES`) já está coberta por `src/lib/authorization.test.ts`, e duplicar essa cobertura aqui seria testar a mesma função duas vezes sem ganho real.

### Gates completos (mudança real de código de produção)
- `npx tsc --noEmit` — aprovado.
- `npm run lint` — aprovado.
- `npm run test` — **3854/3854** (3840 anteriores + 14 novos), zero regressões.
- `npm run build` — aprovado, rota `/app/auditoria` presente no manifesto de build.

### Limitação de verificação, registrada com honestidade

**Não há ferramenta de navegador/captura de tela disponível nesta sessão.** Tentei uma verificação funcional via `curl` contra o servidor de desenvolvimento real: confirmado que `/app/auditoria` sem sessão autenticada redireciona corretamente para `/app/login` (HTTP 307) — o gate de autenticação da aplicação está ativo na rota nova. Uma tentativa de login autenticado via `curl` (usando as credenciais de seed `admin@example.com`) não teve sucesso dentro de um esforço razoável (a rota de callback do Auth.js recusou as credenciais nesse fluxo específico via curl — não investigado a fundo, pois seria esforço desproporcional a uma verificação secundária). **Não declaro a interface visualmente verificada** — a confiança nesta etapa vem do `build` bem-sucedido, do `tsc`/`lint` limpos, e dos 14 testes automatizados contra dados reais, não de uma captura de tela real.

## 5. Evidências de isolamento multi-tenant

Ver testes #1 e #2 da seção 4 — o segundo é o mais rigoroso (mesmo usuário em duas organizações, cenário real já suportado pela funcionalidade "trocar de organização"). Mecanismo: `construirWhereAuditoria()` sempre inclui `organizationId` no nível raiz do `where`, nunca condicionado a filtro algum — mesmo padrão já usado pelas outras 3 funções irmãs (`construirWhereImoveis`/`Clientes`/`Usuarios`), e a tabela `ActivityLog` já está em `TENANT_SCOPED_MODELS` (fail-closed, reconfirmado nesta etapa, inalterado).

## 6. Resultado da verificação de atomicidade da Etapa 1

**Confirmado, reafirmando o que já havia sido documentado no Checkpoint 1 (não uma nova investigação): as 3 exclusões NÃO gravam o evento de auditoria na mesma transação da exclusão.**

Evidência direta no código: `src/lib/activity-log.ts` chama `prisma.activityLog.create()` usando sempre o client global `prisma`, nunca um client de transação (`tx`) — e a própria assinatura da função `logActivity()` não aceita um `tx` como parâmetro. Isso é verdade para os 40+ pontos de uso já existentes no projeto, não é uma particularidade das 3 exclusões desta fase.

**Risco concreto**: se a exclusão (ex.: `prisma.development.deleteMany(...)`) for confirmada com sucesso e a chamada seguinte a `logActivity()` falhar (ex.: pico de carga momentâneo no banco), o registro é excluído **sem nenhum rastro** — exatamente o cenário que esta funcionalidade existe para evitar. O inverso (log gravado, exclusão revertida) não é possível na ordem atual do código (o log só é chamado depois do `await` da exclusão resolver com sucesso), mas se a ordem fosse invertida no futuro, o risco simétrico apareceria.

**Correção recomendada** (não implementada nesta etapa — mudaria os 40+ pontos de uso existentes, risco de regressão maior que o escopo autorizado para a Etapa 2):

1. Estender `logActivity()` para aceitar um `tx` opcional:
   ```ts
   export async function logActivity(
     params: { ...mesmos campos de hoje... },
     tx: Prisma.TransactionClient = prisma
   ) { ... usa `tx.activityLog.create(...)` em vez de `prisma.activityLog.create(...)` ... }
   ```
   Compatível com todos os 40+ call sites existentes sem nenhuma mudança neles (o parâmetro é opcional, cai no `prisma` global por padrão, comportamento idêntico ao de hoje).
2. Nos 3 fluxos de exclusão desta fase (e em fluxos futuros de maior risco, como a Etapa 5 — exclusão definitiva), envolver exclusão + log no mesmo `prisma.$transaction(async (tx) => {...})`, passando `tx` para `logActivity`.
3. **Não** fazer isso retroativamente nos outros 37+ call sites sem necessidade — a maioria (ex.: "convite enviado", "perfil público ativado") não tem o mesmo peso de risco que uma exclusão, e o comentário original do próprio `activity-log.ts` ("nunca deve bloquear a operação principal") continua válido como princípio geral para eventos de baixo risco.

Esta é uma decisão de arquitetura, não uma correção óbvia — fica registrada como pendência explícita (já estava no diagnóstico, seção 13.C), não implementada aqui para não ampliar o escopo autorizado desta etapa.

## 7. Riscos e pendências

- Risco de atomicidade (seção 6) — não corrigido, documentado, correção recomendada apresentada.
- Verificação visual da interface não realizada (seção 4) — limitação de ambiente, não de implementação.
- Resolução de nome de usuário depende de uma segunda consulta (`prisma.user.findMany` pelos `userId`s da página atual) — simples e correta, mas um N+1 "controlado" (1 consulta extra por página, não por linha) — sem impacto de performance perceptível no volume atual (98 linhas reais em produção), registrado para referência futura se o volume crescer muito.

## 8. Estado do Git

HEAD: `a570b6e` (inalterado desde o início da Etapa 1). Nenhum commit, push, deploy, migration ou alteração em produção. Arquivos da Etapa 1 preservados integralmente — nenhum arquivo foi descartado, sobrescrito ou revertido.

---

## Próximo checkpoint

**Etapa 3 — Auditoria de alterações importantes (antes/depois).** Aguardando autorização explícita do proprietário.
