# Acesso demonstrativo para uma imobiliária interessada (REM-003)

## Modelos avaliados

### Modelo 1 — Demonstração acompanhada
O proprietário apresenta o CRM por compartilhamento de tela (Alternativa A). Nenhum acesso é concedido ao interessado.

- **Vantagens**: zero risco, zero infraestrutura, controle total do que é mostrado e em que ordem.
- **Limitações**: não permite exploração livre; depende de agenda.

### Modelo 2 — Conta demonstrativa temporária
O interessado recebe uma conta própria (criada a partir do cenário fictício da Fase 115) com acesso por prazo definido, navegando sozinho, sem supervisão em tempo real.

- **Exige**: a Alternativa B (staging isolado) implantada e validada — conceder uma conta temporária em produção não é aceitável (ver `02-arquitetura-recomendada.md`, por que a Alternativa C foi descartada).
- **Controles necessários**: prazo de expiração da conta/sessão, papel sem privilégios administrativos globais, nenhuma ação do interessado deve poder afetar dado real (garantido pela própria natureza do ambiente isolado).
- **Não implementado nesta fase** — exigiria um módulo de gestão de "convite temporário" com expiração automática, hoje inexistente no produto. Proposta registrada para avaliação futura, não desenvolvida.

### Modelo 3 — Sessão demonstrativa supervisionada
O interessado navega durante uma chamada, mas no ambiente real (local ou staging), com o demonstrador ao lado orientando — misto entre 1 e 2.

- **Exige**: Alternativa A (ambiente local) ou B (staging), dependendo se o cliente acessa da própria máquina (precisa de B) ou da tela do demonstrador (A é suficiente).

## Recomendação para o primeiro cliente

**Modelo 1 (demonstração acompanhada), usando a Alternativa A.** É o que já está pronto e testado (Fase 115), sem custo e sem risco de exposição. O Modelo 2 fica registrado como evolução natural se e quando houver Alternativa B ativa e repetida demanda por acesso self-service — decisão e priorização do proprietário, não executada aqui.

## Regras aplicadas a qualquer modelo com conta real

- Nenhum cadastro público irrestrito é oferecido — contas demo são sempre criadas manualmente a partir do `seed-demo.ts`, nunca por autoatendimento.
- Nenhuma conta demo recebe papel OWNER da organização fictícia além das já definidas no cenário (o seed já distribui papéis realistas — OWNER, ADMIN, BROKER — nenhum deles com privilégio de operador de plataforma).
- Nenhum privilégio administrativo global (`PlatformOperator`/`SUPER_ADMIN`) é concedido a uma conta demonstrativa, em nenhum modelo.
- Credenciais compartilhadas permanentes não são usadas sem os controles de prazo e papel mínimo descritos acima — hoje (Modelo 1) isso é irrelevante porque nenhuma credencial é entregue ao interessado.
- Nenhuma sessão demonstrativa pode afetar dado real — garantido pela escolha de ambiente (local isolado ou staging isolado), nunca produção.
- Nenhuma conta demo é tratada como utilizável indefinidamente — se o Modelo 2 vier a existir, a expiração é um requisito, não uma opção.
