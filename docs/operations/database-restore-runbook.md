# Runbook — Restore do banco de dados (PostgreSQL / Neon)

> **Regra de ouro: nunca testar restore sobre o banco de produção.** Todo
> teste de restore (deste runbook ou de qualquer outro) usa uma branch/banco
> **isolado**, nunca o banco que a aplicação em produção usa de verdade.

## 1. Plano atual e janela de PITR — **A CONFIRMAR**

A produção usa [Neon](https://neon.tech) como provedor de PostgreSQL (ver
README, seção CSP — `DATABASE_URL` aponta pra lá). Este runbook **não
inventa** o plano/retenção porque isso não pode ser verificado por aqui —
precisa ser confirmado direto no painel da Neon por quem tem acesso.

Preencher esta tabela após confirmar no painel (Neon Console → Project →
Settings → Billing / Backup & restore):

| Campo | Valor | Confirmado por | Data |
|---|---|---|---|
| Plano Neon (Free / Launch / Scale / …) | **A CONFIRMAR** | | |
| Janela de PITR (point-in-time recovery) — plano Free da Neon costuma ter uma janela curta (na ordem de horas); planos pagos oferecem janelas maiores (dias) — **o valor exato depende do plano contratado, confirmar no painel** | **A CONFIRMAR** | | |
| Branches automáticas de backup habilitadas? | **A CONFIRMAR** | | |
| Responsável pela conta Neon (quem tem acesso pra fazer restore de produção) | **A CONFIRMAR** | | |

**Enquanto esta tabela não estiver preenchida, trate a janela de restore
como desconhecida** — ou seja, aja como se um incidente só pudesse ser
restaurado a partir do dump manual mais recente (ver seção 4), não confie
em PITR até confirmar que ele está ativo e por quanto tempo.

## 2. Como o restore funciona na Neon (mecanismo, não específico do plano)

A Neon usa **branching com time-travel**, não um restore "in-place"
tradicional:

1. No painel da Neon, ir em **Branches → Create branch**.
2. Escolher **"Create from a point in time"** (ou equivalente na versão
   atual do painel — a Neon evolui a UI, confirmar o nome exato do botão
   na hora) e selecionar o timestamp/LSN desejado, dentro da janela de
   PITR disponível.
3. Isso cria uma **branch nova**, isolada, com os dados exatamente como
   estavam naquele instante — o banco de produção (branch `main` da Neon)
   **não é alterado** por esse passo.
4. Validar os dados na branch nova (ver seção 3 — mesmo processo do teste
   local).
5. **Só depois de validar**: decidir como promover — ou apontar
   `DATABASE_URL` de produção pra essa branch (trocando a connection
   string), ou fazer um dump lógico da branch e restaurar seletivamente
   sobre produção (mais controlado, permite restaurar só algumas tabelas).
   Este passo final **é destrutivo pra produção** — exige confirmação
   explícita de quem está respondendo o incidente (ver
   `incident-response.md`) antes de executar.

## 3. Teste de restore — **testado localmente nesta fase, evidência real**

Como não há acesso ao console da Neon nesta sessão, o mecanismo de
restore foi validado com as ferramentas padrão de PostgreSQL
(`pg_dump`/`pg_restore`) contra o Postgres local (Docker), nunca contra
produção. A lógica é a mesma que se aplica a um dump lógico da Neon; só a
origem do dump muda.

**Procedimento testado** (banco de origem: `imoveis`, com 1 organização e
25 imóveis reais de dev — não um banco vazio):

```bash
# 1. Dump lógico em formato "custom" (compacto, permite restore seletivo)
docker exec projeto-imoveis-db-1 pg_dump -U imoveis -d imoveis -F c -f /tmp/backup.dump

# 2. Banco de destino ISOLADO — nunca o mesmo nome do banco de origem
docker exec projeto-imoveis-db-1 psql -U imoveis -d postgres \
  -c "CREATE DATABASE imoveis_restore_test;"

# 3. Restore na base isolada
docker exec projeto-imoveis-db-1 pg_restore -U imoveis \
  -d imoveis_restore_test --no-owner --no-privileges /tmp/backup.dump

# 4. Validar (comparar contagens com a origem)
docker exec projeto-imoveis-db-1 psql -U imoveis -d imoveis_restore_test \
  -c "SELECT count(*) FROM organizations; SELECT count(*) FROM properties;"

# 5. Limpeza
docker exec projeto-imoveis-db-1 psql -U imoveis -d postgres \
  -c "DROP DATABASE imoveis_restore_test;"
```

**Resultado real do teste**: `organizations` e `properties` e `users`
bateram exatamente entre origem e restore (1 / 25 / 6 respectivamente) —
o ciclo dump → restore → validação funciona como esperado.

### Adaptando pra Neon

Neon expõe uma `DATABASE_URL` normal de Postgres por branch — o mesmo
`pg_dump`/`pg_restore` funciona apontando pra essa connection string, sem
precisar do Docker:

```bash
pg_dump "$DATABASE_URL_DA_BRANCH_NEON" -F c -f backup.dump
pg_restore --dbname="$DATABASE_URL_DE_UM_BANCO_ISOLADO" --no-owner --no-privileges backup.dump
```

O "banco isolado" pode ser outra branch Neon criada só pra esse teste
(`neonctl branches create` ou pelo painel), ou um Postgres local — nunca a
branch `main` de produção.

## 4. Backup manual fora do PITR

Se a janela de PITR não cobrir o momento necessário (ex: incidente
percebido dias depois), a única fonte é um dump manual anterior. **Não
existe hoje um dump agendado fora do PITR da própria Neon** — se isso for
necessário (retenção mais longa que o plano permite), é uma decisão de
produto a tomar depois de confirmar a tabela da seção 1, não algo a
inventar aqui.

## 5. Aplicar migrations após um restore

Depois de restaurar (seja via branch da Neon promovida, seja via dump
manual), rodar:

```bash
npx prisma migrate status   # confere se o banco restaurado está na migration esperada
npx prisma migrate deploy   # aplica qualquer migration pendente, se o restore for de um ponto anterior
```

Um restore de um ponto **anterior** a uma migration recente pode deixar o
banco desalinhado com o código em produção — ver `rollback-runbook.md`
pra decidir se o código também precisa ser revertido (migration
irreversível) ou se basta reaplicar as migrations pendentes (migration
aditiva).

## 6. Checklist rápido de execução

- [ ] Confirmei que é um cenário real de incidente (não teste) antes de
      tocar produção — teste sempre em branch/banco isolado.
- [ ] Abri `incident-response.md` e segui os passos de comunicação antes
      de agir.
- [ ] Criei a branch/restore a partir de produção, nunca sobre produção.
- [ ] Validei os dados na branch/banco isolado antes de promover.
- [ ] Só troquei `DATABASE_URL` de produção (ou fiz restore seletivo)
      depois de validar.
- [ ] Rodei `prisma migrate status` no banco pós-restore.
- [ ] Registrei o incidente e o que foi restaurado (timestamp, motivo).
