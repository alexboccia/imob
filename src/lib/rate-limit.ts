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
  uploadPorUsuario: { limite: 30, janelaSegundos: 10 * 60 },
  uploadPorOrganizacao: { limite: 100, janelaSegundos: 10 * 60 },
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

export type FormularioTipo = "contato" | "anuncie";

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
