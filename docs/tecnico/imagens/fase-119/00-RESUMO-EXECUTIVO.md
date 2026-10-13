# 00 — Resumo executivo — Fase 119

**Veredito: AGUARDANDO APROVAÇÃO TÉCNICA.** Auditoria exclusivamente documental — nenhum código, schema, dado, configuração do R2, plano comercial ou produção foi alterado; nenhuma fotografia foi excluída; nenhum commit/push/deploy foi realizado.

## A. Diagnóstico

**Confirmado por leitura direta do código**: não existe compressão real antes do armazenamento no R2 para fotos de imóvel. O único mecanismo de compressão do produto (sharp → WebP qualidade 82, com correção de orientação EXIF) existe e funciona, mas é exclusivo da imagem de Hero institucional — nunca foi estendido à pasta `imoveis`, que é o maior volume real de uso da plataforma. Fotos de imóvel são armazenadas byte-a-byte como o navegador as envia, até 10MB cada, **incluindo metadados EXIF/GPS originais**.

## B. Arquitetura atual

Upload intermediado pelo servidor (sem URL pré-assinada): navegador → `POST /api/admin/upload` → validação (magic bytes + MIME + extensão + tamanho) → R2 (sem reprocessamento para `imoveis`) → URL devolvida ao cliente → Server Action do imóvel persiste a URL como linha `Media` numa submissão separada. Entrega via `next/image`, que otimiza/redimensiona sob demanda no momento da requisição (sem alterar o arquivo original armazenado). Exclusão de foto/imóvel nunca remove o objeto do R2 — só a linha do banco; existe uma única ferramenta manual de limpeza (`limparMidiasOrfas()`), restrita à pasta `imoveis/` e sem modo dry-run. **Achado de maior severidade**: excluir uma organização nunca limpa seus arquivos no R2, e depois da exclusão nem a ferramenta de limpeza consegue mais alcançá-los — órfão permanente confirmado.

## C. Arquitetura recomendada

Reaproveitar o padrão já em produção do Hero (sharp + WebP + correção EXIF) e estendê-lo à pasta `imoveis`, no servidor (não no navegador) — é a única alternativa que garante o resultado independente de quem envia, resolve o achado de privacidade (EXIF/GPS) como efeito colateral, e não introduz dependência nova. Parâmetros exatos (largura máxima, qualidade) ficam como proposta inicial, pendentes de teste visual real antes de fixar (`03-ESTRATEGIAS-OTIMIZACAO.md`).

## D. Economia estimada

Em qualquer cenário simulado (BASICO/PRO/PREMIUM, 1MB a 5MB por foto sem otimização vs. 0,3-0,5MB com otimização), a economia de armazenamento R2 é da ordem de 75% — mas o custo absoluto de armazenamento é irrelevante em todas as escalas simuladas (menos de US$5/organização/mês mesmo em cenário de alto consumo, menos de US$200/mês mesmo com 100 organizações PREMIUM simultâneas no limite máximo). **A justificativa real para otimizar não é economia de armazenamento, é desempenho de carregamento, previsibilidade operacional e a correção do achado de privacidade.** Esta fase também corrigiu uma divergência de unidades (MB/GB decimal vs. binário) identificada nos cálculos da Fase 118, adotando e declarando explicitamente a convenção decimal em todos os cálculos.

## E. Riscos encontrados

Classificados por severidade: **Alto** — EXIF/GPS preservado em fotos de imóvel (privacidade). **Médio** — mídia de imóvel (foto/vídeo/planta) é a única categoria do produto que não valida a origem da URL antes de persistir (achado novo, inconsistente com o padrão já aplicado em materiais/hero/perfil/logo); ausência de decodificação completa fora do Hero (PDF com JavaScript embutido servido inline é o caso mais concreto). **Baixo** — fotos de imóveis em DRAFT/INACTIVE não têm controle de acesso próprio no storage (dependem só do segredo da chave UUID); rate limiting de upload fail-open sem Upstash configurado; ausência de `CacheControl`/`ContentDisposition` explícitos. Arquivos órfãos: três origens confirmadas (edição/substituição de foto, upload sem submissão do formulário, exclusão de organização) — a última é a mais grave por ser hoje irrecuperável pela ferramenta existente.

## F. Plano de implementação (proposto, não executado)

Cinco etapas pequenas e reversíveis, detalhadas em `08-ROADMAP-IMPLEMENTACAO.md`: (1) compressão no servidor para `imoveis`; (2) validação de origem da URL de mídia de imóvel; (3) extensão do escopo de limpeza de órfãos + modo dry-run; (4) captura de pendência de limpeza R2 no momento da exclusão de organização; (5) cabeçalhos de cache/disposição explícitos. Nenhuma foi iniciada.

## G. Decisões pendentes

Nove decisões objetivas listadas em `09-DECISOES-PENDENTES.md`, cobrindo: aprovação da compressão no servidor e seus parâmetros, correção da validação de origem de URL, tratamento de fotos já existentes, extensão da ferramenta de limpeza, órfãos já gerados no passado (requer investigação adicional contra produção, fora do escopo autorizado aqui), medição real de amostra de foto, e confirmação dos limites comerciais propostos.

---

**Documentos criados** (todos em `docs/tecnico/imagens/fase-119/`, nenhum documento de fase anterior foi modificado): `00-RESUMO-EXECUTIVO.md`, `01-AUDITORIA-UPLOAD.md`, `02-COMPRESSAO-ATUAL.md`, `03-ESTRATEGIAS-OTIMIZACAO.md`, `04-SIMULACAO-ARMAZENAMENTO.md`, `05-AUDITORIA-ARQUIVOS-ORFAOS.md`, `06-SEGURANCA-IMAGENS.md`, `07-IMPACTO-PLANOS.md`, `08-ROADMAP-IMPLEMENTACAO.md`, `09-DECISOES-PENDENTES.md`.

**Estado do repositório**: drift pré-existente preservado integralmente (`src/app/layout.tsx` modificado, `public/demo-fotos/` não rastreado — nenhum dos dois tocado). Documentos das Fases 117/118 (`docs/comercial/planos/`) intocados. Os 10 documentos desta fase foram criados e **não foram comitados**.

**Confirmação**: nenhuma implementação, alteração de código/schema/dado/configuração do R2/plano comercial, commit, push ou deploy foi realizada. Nenhuma fotografia foi excluída. Nenhum script de limpeza foi executado.

**Aguardando aprovação técnica do proprietário antes de qualquer implementação. Não iniciar a próxima fase automaticamente.**
