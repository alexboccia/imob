// Conjuntos de papéis autorizados por área sensível do painel. Centralizado
// aqui para que a regra de "quem pode fazer o quê" tenha um único lugar de
// verdade — evita checagens de papel divergentes espalhadas pelas actions.
export const PAPEIS_GESTAO_CONFIGURACOES: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
]);

export const PAPEIS_GESTAO_CATALOGOS: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
  "MANAGER",
]);

export const PAPEIS_GESTAO_USUARIOS: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
]);

// Fase 13 — LIQUIDAÇÃO de comissão. Não é papel financeiro inventado: é
// a camada gerencial que este arquivo já define, aplicada a uma operação
// mais sensível que as demais do CRM. Registrar ou cancelar pagamento
// afirma que dinheiro mudou de mãos — mais grave que atribuir uma parcela
// (Fase 12), que segue no gate do CRM. A assimetria é deliberada e está
// documentada como dívida no relatório da fase.
export const PAPEIS_LIQUIDACAO_COMISSAO: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
  "MANAGER",
]);

// Fase 21 — VISÃO DE EQUIPE na Central.
//
// NENHUM papel novo foi criado, e nenhuma migration: a auditoria mostrou
// que a camada gerencial JÁ EXISTE no domínio e já é {OWNER, ADMIN,
// MANAGER}. Três capacidades independentes convergem exatamente nesse
// trio — PAPEIS_GESTAO_CATALOGOS, PAPEIS_LIQUIDACAO_COMISSAO (cujo
// comentário acima já a chama de "a camada gerencial que este arquivo já
// define") e a checagem de /app/manutencao. Inventar TEAM_LEAD ou
// SALES_MANAGER seria um quarto conceito de autoridade para dizer o que
// o produto já diz.
//
// Por que NÃO é o mesmo conjunto de PAPEIS_GESTAO_USUARIOS/CONFIGURACOES
// ({OWNER, ADMIN}): esses dois são autoridade INSTITUCIONAL — mexer em
// quem entra na organização e em como ela se apresenta. Acompanhar o
// trabalho comercial da equipe é autoridade COMERCIAL, e é justamente
// nela que MANAGER participa em todo o resto do produto.
//
// ASSISTANT e BROKER ficam de fora: nenhuma capacidade gerencial do
// produto os inclui hoje, e esta fase não é o lugar para promovê-los.
//
// LIMITE HONESTO desta autorização: ela decide quem recebe a LEITURA
// AGREGADA da equipe, não quem pode alcançar os dados. O CRM inteiro
// (Clientes, Pipeline, Agenda) hoje é escopado só por organização e pelo
// módulo — qualquer membro com CRM já enxerga todas as negociações da
// organização. Ver a dívida registrada no relatório da Fase 21.
export const PAPEIS_VISAO_EQUIPE: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
  "MANAGER",
]);

// Fase 23 — MANUTENÇÃO do site (limpeza de mídias órfãs).
//
// Não muda quem tem acesso: é exatamente o trio que a Server Action e a
// página de /app/manutencao já exigiam, escrito inline em dois lugares.
// A Fase 21 registrou essa duplicação como dívida — ela contrariava a
// promessa deste arquivo de ser "um único lugar de verdade", e um dos
// dois pontos podia divergir do outro sem ninguém perceber.
export const PAPEIS_MANUTENCAO: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
  "MANAGER",
]);

// Fase 24 — RESOLUÇÃO DE IDENTIDADE de captação pública ambígua.
//
// Conjunto próprio, e não um reuso de PAPEIS_VISAO_EQUIPE: aquele
// nomeia "quem acompanha o trabalho da equipe", e esta é outra
// capacidade — decidir a QUAL cliente um contato pertence, o que liga
// PII a um cadastro e é irreversível na prática. Que os dois conjuntos
// tenham hoje os mesmos papéis é coincidência de valor, não de
// significado; fundi-los faria uma mudança em um alterar o outro em
// silêncio.
//
// Por que a camada gerencial: uma captação pendente NÃO tem
// responsibleMemberId — ninguém conduz um contato cuja identidade é
// desconhecida. Atribuí-la a um BROKER seria escolher dono para um lead
// que ainda não é de ninguém, exatamente o tipo de arbitrariedade que
// esta fase existe para evitar. É a mesma fila gerencial das
// negociações sem responsável (Fase 21).
export const PAPEIS_RESOLUCAO_IDENTIDADE: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
  "MANAGER",
]);

// Fase 27 — CONTRATO FINANCEIRO da organização com o easymob.
//
// Conjunto próprio, e não reuso de PAPEIS_GESTAO_CONFIGURACOES: aquele
// nomeia "quem ajusta como a imobiliária opera"; este nomeia "quem
// responde pelo contrato". São a mesma dupla de papéis hoje, e isso é
// coincidência de valor, não de significado — fundi-los faria uma
// mudança em um alterar o outro em silêncio.
//
// MANAGER fica FORA deliberadamente. Gerir a equipe comercial é
// capacidade operacional; comprometer a imobiliária financeiramente não
// decorre dela. Um papel não herda autoridade contratual por acumular
// outras capacidades.
export const PAPEIS_FINANCEIRO: ReadonlySet<string> = new Set(["OWNER", "ADMIN"]);

// Quem pode manter o PRÓPRIO perfil público. Não é gestão de usuários e
// não deve virar: editar a si mesmo não dá acesso a papel, status,
// vínculo, convite ou a qualquer outro membro — a action de
// autoatendimento nem recebe um id de membro, resolve o vínculo pela
// sessão.
//
// ASSISTANT fica de fora, e a razão é de conteúdo, não de risco técnico:
// a página pública apresenta quem está publicado como "Corretor(a) de
// imóveis", título de profissão regulamentada. Deixar alguém se
// autodeclarar corretor seria o produto afirmando algo que não verificou.
// Um assistente que precise aparecer continua podendo ser publicado por
// um administrador pela tela de usuários — comportamento que já existia e
// que esta fase não altera.
export const PAPEIS_PERFIL_PUBLICO_PROPRIO: ReadonlySet<string> = new Set([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "BROKER",
]);

export function temPapel(
  role: string | undefined,
  permitidos: ReadonlySet<string>
): boolean {
  return !!role && permitidos.has(role);
}
