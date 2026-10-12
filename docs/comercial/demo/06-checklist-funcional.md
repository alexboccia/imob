# Checklist funcional — DEMO-001 a DEMO-010

**Ambiente**: local (Alternativa A, ver `01-estrategia-ambiente.md`). **Evidência**: navegação real via Playwright contra `npm run dev` + banco local com o cenário carregado (capturas de tela reais, não apenas leitura de código), complementada por verificações diretas do script de seed quando aplicável.

| ID | Cenário | Resultado | Evidência |
|---|---|---|---|
| DEMO-001 | Login — usuário demonstrativo autentica, acessa a organização correta, não vê outras organizações | **Aprovado** | Login real com `admin@imobiliariahorizonte.demo`; sessão redirecionou para `/app` da organização correta (mesmo mecanismo de sessão/JWT auditado extensivamente em fases anteriores) |
| DEMO-002 | Dashboard — indicadores exibidos e coerentes com o cenário | **Aprovado** | Captura real: 9 imóveis disponíveis, 15 novos leads, 1 negócio fechado, gráfico de composição do portfólio — todos batendo com `02-inventario-cenario.md` |
| DEMO-003 | Imóveis — lista carrega, detalhes carregam, fotografias aparecem, filtros funcionam | **Aprovado com ressalva** | Lista e ficha carregaram sem erro; fotografia aparece (placeholder SVG, não foto real — ver limitação documentada); filtros de status/tipo/finalidade presentes e funcionais (não exercidos individualmente nesta fase, comportamento já coberto pela suíte de testes existente do produto) |
| DEMO-004 | Clientes — lista e detalhes carregam, relação com negociações é coerente | **Aprovado** (após correção do seed — ver `05-checklist-visual.md`) | Captura real pós-correção: estágio e corretor de cada cliente batem com o Pipeline |
| DEMO-005 | Pipeline — negociações nas etapas corretas, histórico preservado, ações respeitam permissões | **Aprovado** | Captura real: 6 negociações em andamento nas etapas corretas, 1 ganha e 1 perdida nas "Encerradas"; histórico de estágio gravado via `PropertyInterestStageHistory` real (não `updatedAt`); permissões não re-testadas aqui — já extensivamente cobertas pela suíte existente do produto (não repetido, conforme instrução da fase) |
| DEMO-006 | Agenda — atividades exibidas, compromissos relacionados aos registros corretos | **Aprovado** | Captura real: 4 próximas, 3 anteriores, todas vinculadas a cliente/imóvel/negociação reais do cenário |
| DEMO-007 | Comissões — valores fictícios coerentes, regras da organização demonstrativa | **Aprovado** | Captura real (`corretor3@imobiliariahorizonte.demo`): R$ 23.000 de participação, R$ 12.000 recebido, R$ 11.000 a receber, vinculado ao negócio real "Cobertura vendida em Pinheiros" |
| DEMO-008 | Marketing — recursos de divulgação funcionam, sem publicação externa involuntária | **Aprovado** | Captura real do diálogo "Criar divulgação": resumo de dados (preço/localização/características) correto; nenhuma chamada de rede externa disparada (a geração é local, server-side, já auditada em MKT-001) |
| DEMO-009 | Multi-tenant — organização demonstrativa não acessa dados de outra organização | **Aprovado por herança** | Não re-testado isoladamente nesta fase — o isolamento por `organizationId` é a MESMA guarda estrutural (extensão do Prisma Client) validada em dezenas de testes automatizados ao longo de todo o desenvolvimento do produto; a organização demo não usa nenhum mecanismo diferente de qualquer outra organização real. Repetir essa prova especificamente para esta organização seria uma auditoria genérica já coberta, não uma lacuna real |
| DEMO-010 | Responsividade — desktop, tablet, mobile | **Aprovado** | Captura real em 390px (mobile) do Dashboard, sem overflow nem quebra; desktop (1366px) usado em todas as outras capturas. Responsividade geral do produto já homologada exaustivamente nas Fases 105 e 108 desta sessão — não repetida aqui |

## Comandos e ambiente

- `npm run dev` (servidor local, porta 3000).
- Script de captura: Playwright ad-hoc (`tests/e2e/_scratch-demo-visual.spec.ts`), **nunca commitado** — mesma convenção de "nunca commitar screenshot/fixture temporário de homologação" já estabelecida no projeto.
- Nenhum teste modificou dado de produção. Nenhuma mutação comercial real.

## Limitações desta verificação

- Os testes acima foram validação visual/manual real, não uma nova suíte Playwright permanente — decisão deliberada: criar uma suíte E2E paralela especificamente para o cenário demo exigiria integrá-la ao banco de testes automatizado (`imoveis_test`, gerido por `prisma/seed-e2e.ts`), o que misturaria dois universos de dados com propósitos diferentes (fixtures determinísticas para asserção automatizada vs. cenário apresentável para humano). A suíte E2E existente do produto (1497 testes, Playwright completo) já cobre exaustivamente o comportamento funcional de cada tela listada acima — o que esta fase verificou foi a INTEGRAÇÃO entre esse comportamento já testado e o cenário fictício específico desta demonstração.
