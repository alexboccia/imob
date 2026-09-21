import type { KvStore } from "@/lib/kv-store";
import { hashCurto } from "@/lib/hash";
import { registrarAbuso } from "@/lib/abuse-log";
import { normalizarTelefone } from "@/lib/telefone";

export type ResultadoLimite =
  | { permitido: true }
  | { permitido: false; motivo: string; retryAfterSegundos: number };

// Valores conservadores e centralizados — mesma filosofia já usada em
// upload-validation.ts. Ajustar aqui não exige tocar em nenhum ponto de
// integração.
export const LIMITES = {
  login: { tentativas: 5, janelaSegundos: 5 * 60 },
  loginNiveisBloqueioSegundos: [5 * 60, 15 * 60, 60 * 60, 24 * 60 * 60],
  loginViolacoesJanelaSegundos: 24 * 60 * 60,
  formularioCurto: { limite: 5, janelaSegundos: 15 * 60 },
  formularioDiario: { limite: 20, janelaSegundos: 24 * 60 * 60 },
  // Fase 56 — SOLICITAÇÃO DE VISITA, BALDE POR IMÓVEL.
  //
  // Os baldes acima (IP, organização, contato) já existiam e continuam
  // valendo. Falta um: nada impedia que UM imóvel consumisse sozinho a
  // cota inteira da organização, vindo de IPs e contatos diferentes —
  // que é exatamente a forma do abuso descrito ("dezenas de
  // solicitações contra o mesmo imóvel").
  //
  // OS NÚMEROS NÃO SÃO ARBITRÁRIOS: são derivados dos limites que já
  // existem. A janela curta repete `formularioCurto` (5/15min), porque o
  // ritmo humano plausível não muda por ser um imóvel em vez de um IP. A
  // diária é METADE de `formularioDiario` (10, contra 20): o teto da
  // organização é o limite externo, e o balde por imóvel só precisa
  // garantir que um anúncio sozinho não o esgote. Dez pedidos de visita
  // no mesmo imóvel em 24h continua sendo muito acima do tráfego real de
  // um anúncio legítimo.
  visitaPorImovelCurto: { limite: 5, janelaSegundos: 15 * 60 },
  visitaPorImovelDiario: { limite: 10, janelaSegundos: 24 * 60 * 60 },
  uploadPorUsuario: { limite: 30, janelaSegundos: 10 * 60 },
  uploadPorOrganizacao: { limite: 100, janelaSegundos: 10 * 60 },
  // Tracking digital (Fase 6). Deliberadamente MUITO mais folgado que os
  // limites de formulário: aqui o custo de errar pra menos é sério —
  // um visitante legítimo que navega bastante sumiria das métricas e o
  // dashboard mentiria pro corretor. 300 eventos por IP em 10 minutos é
  // ordens de grandeza acima de qualquer navegação humana real (a
  // deduplicação de 30 min já corta repetição no mesmo imóvel), e ainda
  // assim impede alguém de martelar o endpoint milhões de vezes.
  //
  // Balde por organização também: protege UM tenant de ter as métricas
  // inundadas, sem que o abuso contra ele afete os outros.
  // Recuperação de senha (Fase 25). Endpoint público e abusável de duas
  // formas distintas, por isso dois baldes:
  //   por IP    — impede alguém de varrer uma lista de e-mails para
  //               descobrir quais existem (ainda que a resposta seja
  //               genérica, o volume em si é o ataque);
  //   por e-mail — impede usar o produto como máquina de spam contra uma
  //               vítima específica, inundando a caixa dela.
  // A chave de e-mail é HASH (hashCurto), nunca o endereço: PII não entra
  // no armazenamento de limite.
  // Cadastro de imobiliária (Fase 26). Mais apertado que a recuperação
  // de senha porque o custo do abuso é maior: cada confirmação cria um
  // TENANT com trial. Por IP corta a criação em massa; por e-mail corta
  // usar o produto como máquina de spam contra uma pessoa.
  cadastroPorIp: { limite: 5, janelaSegundos: 60 * 60 },
  cadastroPorEmail: { limite: 3, janelaSegundos: 60 * 60 },
  recuperacaoPorIp: { limite: 10, janelaSegundos: 60 * 60 },
  recuperacaoPorEmail: { limite: 5, janelaSegundos: 60 * 60 },
  analyticsPorIp: { limite: 300, janelaSegundos: 10 * 60 },
  analyticsPorOrganizacao: { limite: 5000, janelaSegundos: 10 * 60 },
} as const;

// null quando o valor normaliza pra string vazia (só espaços, por
// exemplo) — nunca retorna "". Isso importa pra deduplicação de Person
// (src/lib/person-dedup.ts): "" é um valor real pra fins de unique
// constraint (diferente de NULL), então um e-mail "sujo" que normalizasse
// pra "" faria toda Person com contato inválido colidir entre si.
export function normalizarEmail(email: string): string | null {
  return email.trim().toLowerCase() || null;
}

export function normalizarContato(email: string | null | undefined, telefone: string | null | undefined): string {
  if (email) {
    const normalizado = normalizarEmail(email);
    if (normalizado) return normalizado;
  }
  if (telefone) {
    const normalizado = normalizarTelefone(telefone);
    if (normalizado) return normalizado;
  }
  return "";
}

// ---------------------------------------------------------------------
// Login: por IP e por e-mail normalizado, com bloqueio progressivo.
// ---------------------------------------------------------------------

// `prefixo` (default "login") separa o balde de tentativas entre
// superfícies de login diferentes — ex: "platform-login" pro /platform,
// pra uma conta de PlatformOperator comprometida não compartilhar
// contador por IP com o login normal de tenant, e vice-versa.
function chaveLoginContador(dimensao: "ip" | "email", valor: string, prefixo = "login") {
  return `rl:${prefixo}:contador:${dimensao}:${valor}`;
}
function chaveLoginBloqueio(dimensao: "ip" | "email", valor: string, prefixo = "login") {
  return `rl:${prefixo}:bloqueio:${dimensao}:${valor}`;
}
function chaveLoginViolacoes(dimensao: "ip" | "email", valor: string, prefixo = "login") {
  return `rl:${prefixo}:violacoes:${dimensao}:${valor}`;
}

type DimensaoLogin = { tipo: "ip" | "email"; valor: string };

function dimensoesLogin(params: { ip: string; email: string | null }): DimensaoLogin[] {
  const dims: DimensaoLogin[] = [{ tipo: "ip", valor: params.ip }];
  const emailNormalizado = params.email ? normalizarEmail(params.email) : null;
  if (emailNormalizado) dims.push({ tipo: "email", valor: hashCurto(emailNormalizado) });
  return dims;
}

// Checagem "leve" (só leitura de TTL) — usada antes de sequer chamar o
// NextAuth, pra devolver 429 sem gastar bcrypt/consulta ao banco.
export async function verificarBloqueioLogin(
  store: KvStore,
  params: { ip: string; email: string | null },
  prefixo = "login"
): Promise<ResultadoLimite> {
  let piorTtl = 0;
  for (const { tipo, valor } of dimensoesLogin(params)) {
    const ttl = await store.ttl(chaveLoginBloqueio(tipo, valor, prefixo));
    if (ttl > piorTtl) piorTtl = ttl;
  }
  if (piorTtl > 0) {
    return { permitido: false, motivo: "bloqueio_login", retryAfterSegundos: piorTtl };
  }
  return { permitido: true };
}

// Chamada dentro do authorize() do NextAuth quando as credenciais são
// inválidas. Incrementa o contador de falhas e, se estourar o limite,
// escala o bloqueio progressivo (5min → 15min → 1h → 24h).
export async function registrarFalhaLogin(
  store: KvStore,
  params: { ip: string; email: string | null },
  prefixo = "login",
  tentativasPermitidas: number = LIMITES.login.tentativas
): Promise<void> {
  for (const { tipo, valor } of dimensoesLogin(params)) {
    const { contagem } = await store.incrementarComJanela(
      chaveLoginContador(tipo, valor, prefixo),
      LIMITES.login.janelaSegundos
    );
    if (contagem > tentativasPermitidas) {
      const { contagem: violacoes } = await store.incrementarComJanela(
        chaveLoginViolacoes(tipo, valor, prefixo),
        LIMITES.loginViolacoesJanelaSegundos
      );
      const indice = Math.min(violacoes - 1, LIMITES.loginNiveisBloqueioSegundos.length - 1);
      const duracao = LIMITES.loginNiveisBloqueioSegundos[indice];
      await store.definir(chaveLoginBloqueio(tipo, valor, prefixo), "1", duracao);
      registrarAbuso({
        tipo: "login",
        motivo: `bloqueio_progressivo_${tipo}`,
        ip: tipo === "ip" ? valor : undefined,
        identificadorHash: tipo === "email" ? valor : undefined,
      });
    }
  }
}

// Chamada em login bem-sucedido — limpa os contadores de falha (não o
// histórico de violações, que continua valendo pra escalar o bloqueio se
// o abuso recomeçar).
export async function registrarSucessoLogin(
  store: KvStore,
  params: { ip: string; email: string | null },
  prefixo = "login"
): Promise<void> {
  for (const { tipo, valor } of dimensoesLogin(params)) {
    await store.remover(chaveLoginContador(tipo, valor, prefixo));
  }
}

// ---------------------------------------------------------------------
// Formulários públicos (contato / anuncie): por IP, por organização e por
// contato normalizado, cada um com janela curta + diária.
// ---------------------------------------------------------------------

export type FormularioTipo = "contato" | "anuncie" | "materiais" | "visita";

type ChecagemLimite = { chave: string; limite: number; janelaSegundos: number; motivo: string };

function checagensFormulario(params: {
  formulario: FormularioTipo;
  ip: string;
  organizationId: string;
  contatoNormalizado: string;
}): ChecagemLimite[] {
  const { formulario, ip, organizationId, contatoNormalizado } = params;
  const { limite: limiteCurto, janelaSegundos: janelaCurta } = LIMITES.formularioCurto;
  const { limite: limiteDiario, janelaSegundos: janelaDiaria } = LIMITES.formularioDiario;

  const checagens: ChecagemLimite[] = [
    { chave: `rl:${formulario}:ip:${ip}:curta`, limite: limiteCurto, janelaSegundos: janelaCurta, motivo: "ip_curto" },
    { chave: `rl:${formulario}:ip:${ip}:diaria`, limite: limiteDiario, janelaSegundos: janelaDiaria, motivo: "ip_diario" },
    { chave: `rl:${formulario}:org:${organizationId}:curta`, limite: limiteCurto, janelaSegundos: janelaCurta, motivo: "org_curto" },
    { chave: `rl:${formulario}:org:${organizationId}:diaria`, limite: limiteDiario, janelaSegundos: janelaDiaria, motivo: "org_diario" },
  ];

  if (contatoNormalizado) {
    const contatoHash = hashCurto(contatoNormalizado);
    checagens.push(
      { chave: `rl:${formulario}:contato:${contatoHash}:curta`, limite: limiteCurto, janelaSegundos: janelaCurta, motivo: "contato_curto" },
      { chave: `rl:${formulario}:contato:${contatoHash}:diaria`, limite: limiteDiario, janelaSegundos: janelaDiaria, motivo: "contato_diario" }
    );
  }

  return checagens;
}

async function aplicarChecagens(store: KvStore, checagens: ChecagemLimite[]): Promise<ResultadoLimite> {
  let motivo: string | null = null;
  let retryAfterSegundos = 0;
  for (const checagem of checagens) {
    const { contagem, ttlSegundos } = await store.incrementarComJanela(
      checagem.chave,
      checagem.janelaSegundos
    );
    if (contagem > checagem.limite && ttlSegundos > retryAfterSegundos) {
      motivo = checagem.motivo;
      retryAfterSegundos = ttlSegundos;
    }
  }
  if (motivo) return { permitido: false, motivo, retryAfterSegundos };
  return { permitido: true };
}

// Recuperação de senha (Fase 25). Fail-open como todo o resto: sem
// Upstash configurado, quem chama simplesmente segue — a ausência de
// rate limit nunca pode impedir alguém de recuperar a própria conta.
export async function verificarLimiteRecuperacaoSenha(
  store: KvStore,
  params: { ip: string; emailNormalizado: string | null }
): Promise<ResultadoLimite> {
  const { limite: limiteIp, janelaSegundos: janelaIp } = LIMITES.recuperacaoPorIp;
  const { limite: limiteEmail, janelaSegundos: janelaEmail } = LIMITES.recuperacaoPorEmail;

  const checagens: ChecagemLimite[] = [
    { chave: `rl:reset:ip:${params.ip}`, limite: limiteIp, janelaSegundos: janelaIp, motivo: "ip" },
  ];
  if (params.emailNormalizado) {
    checagens.push({
      chave: `rl:reset:email:${hashCurto(params.emailNormalizado)}`,
      limite: limiteEmail,
      janelaSegundos: janelaEmail,
      motivo: "email",
    });
  }
  return aplicarChecagens(store, checagens);
}

// Cadastro público (Fase 26). Fail-open como todo o resto.
export async function verificarLimiteCadastro(
  store: KvStore,
  params: { ip: string; emailNormalizado: string | null }
): Promise<ResultadoLimite> {
  const { limite: limiteIp, janelaSegundos: janelaIp } = LIMITES.cadastroPorIp;
  const { limite: limiteEmail, janelaSegundos: janelaEmail } = LIMITES.cadastroPorEmail;

  const checagens: ChecagemLimite[] = [
    { chave: `rl:signup:ip:${params.ip}`, limite: limiteIp, janelaSegundos: janelaIp, motivo: "ip" },
  ];
  if (params.emailNormalizado) {
    checagens.push({
      // hashCurto: o e-mail nunca vira chave em texto claro no
      // armazenamento de limite.
      chave: `rl:signup:email:${hashCurto(params.emailNormalizado)}`,
      limite: limiteEmail,
      janelaSegundos: janelaEmail,
      motivo: "email",
    });
  }
  return aplicarChecagens(store, checagens);
}

// Fase 56 — balde adicional do formulário de visita: por IMÓVEL. Fica
// numa função própria (e não dentro de checagensFormulario) porque só o
// formulário de visita tem imóvel; os outros três não teriam o que
// passar aqui. Fail-open como todo o resto, pelo mesmo motivo: sem KV
// configurado, o pedido legítimo passa.
export async function verificarLimiteVisitaPorImovel(
  store: KvStore,
  params: { organizationId: string; propertyId: string }
): Promise<ResultadoLimite> {
  const { limite: limiteCurto, janelaSegundos: janelaCurta } = LIMITES.visitaPorImovelCurto;
  const { limite: limiteDiario, janelaSegundos: janelaDiaria } = LIMITES.visitaPorImovelDiario;
  // A chave inclui a organização: dois tenants nunca compartilham balde,
  // nem por colisão de id.
  const base = `rl:visita:imovel:${params.organizationId}:${params.propertyId}`;
  return aplicarChecagens(store, [
    { chave: `${base}:curta`, limite: limiteCurto, janelaSegundos: janelaCurta, motivo: "imovel_curto" },
    { chave: `${base}:diaria`, limite: limiteDiario, janelaSegundos: janelaDiaria, motivo: "imovel_diario" },
  ]);
}

export async function verificarLimiteFormulario(
  store: KvStore,
  params: {
    formulario: FormularioTipo;
    ip: string;
    organizationId: string;
    contatoNormalizado: string;
  }
): Promise<ResultadoLimite> {
  return aplicarChecagens(store, checagensFormulario(params));
}

// ---------------------------------------------------------------------
// Upload: por usuário (membro da organização) e por organização.
// O limite total de mídia por plano (entitlements.ts) continua existindo
// à parte — isto aqui é só "não mais que N uploads por janela de tempo",
// não substitui nenhum limite de plano já existente.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Tracking digital (Fase 6): por IP e por organização. Fail-open como
// todo o resto — sem Upstash configurado, quem chama simplesmente
// registra o evento (ver comentário de obterKvStore).
// ---------------------------------------------------------------------

export async function verificarLimiteAnalytics(
  store: KvStore,
  params: { ip: string; organizationId: string }
): Promise<ResultadoLimite> {
  const { limite: limiteIp, janelaSegundos: janelaIp } = LIMITES.analyticsPorIp;
  const { limite: limiteOrg, janelaSegundos: janelaOrg } = LIMITES.analyticsPorOrganizacao;

  return aplicarChecagens(store, [
    { chave: `rl:analytics:ip:${params.ip}`, limite: limiteIp, janelaSegundos: janelaIp, motivo: "ip" },
    {
      chave: `rl:analytics:org:${params.organizationId}`,
      limite: limiteOrg,
      janelaSegundos: janelaOrg,
      motivo: "org",
    },
  ]);
}

export async function verificarLimiteUpload(
  store: KvStore,
  params: { organizationMemberId: string; organizationId: string }
): Promise<ResultadoLimite> {
  const { limite: limiteUsuario, janelaSegundos: janelaUsuario } = LIMITES.uploadPorUsuario;
  const { limite: limiteOrg, janelaSegundos: janelaOrg } = LIMITES.uploadPorOrganizacao;

  return aplicarChecagens(store, [
    {
      chave: `rl:upload:usuario:${params.organizationMemberId}`,
      limite: limiteUsuario,
      janelaSegundos: janelaUsuario,
      motivo: "usuario",
    },
    {
      chave: `rl:upload:org:${params.organizationId}`,
      limite: limiteOrg,
      janelaSegundos: janelaOrg,
      motivo: "organizacao",
    },
  ]);
}
