// Resolução do IP real do cliente, considerando a cadeia de proxy da
// infraestrutura atual (Cloudflare da própria DigitalOcean → App Platform
// → container). Confirmado na documentação oficial da DO
// (https://docs.digitalocean.com/support/where-can-i-find-the-client-ip-address-of-a-request-connecting-to-my-app/):
//
//   - `do-connecting-ip`: header injetado pelo próprio ingress da DO com o
//     IP real do cliente. É o único confiável aqui — o cliente não tem
//     como definir esse header, ele é sobrescrito pelo ingress da DO antes
//     de chegar no container.
//   - `x-forwarded-for`: NA DO APP PLATFORM ESPECIFICAMENTE, esse header
//     contém o IP do servidor de ingress da própria DO, não o do cliente
//     final — documentado oficialmente, não é um descuido nosso. Por isso
//     ele só é usado aqui como fallback de última instância (ex: rodando
//     localmente atrás de outro proxy, fora da DO), nunca como fonte
//     primária, e nunca confiando cegamente no primeiro valor da lista
//     (que é sempre o mais fácil de forjar pelo próprio cliente).
//   - `CF-Connecting-IP`: a DO NÃO repassa esse header pro container
//     (confirmado também na documentação/discussões oficiais), então não
//     dá pra usar apesar de haver Cloudflare na frente.
//
// Se nenhum header confiável estiver presente (ex: ambiente local sem
// nenhum proxy), cai num valor fixo — isso faz o rate limit por IP virar
// um "balde" único compartilhado por todo tráfego sem IP identificável,
// em vez de quebrar a aplicação.
const IP_DESCONHECIDO = "desconhecido";

export function obterIpCliente(headers: Headers): string {
  const doConnectingIp = headers.get("do-connecting-ip");
  if (doConnectingIp && ipValido(doConnectingIp)) {
    return doConnectingIp.trim();
  }

  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const partes = forwardedFor.split(",").map((p) => p.trim());
    const candidato = partes[partes.length - 1];
    if (candidato && ipValido(candidato)) {
      return candidato;
    }
  }

  return IP_DESCONHECIDO;
}

function ipValido(valor: string): boolean {
  const v = valor.trim();
  if (!v || v.length > 45) return false;
  // Checagem simples de formato (IPv4 ou IPv6), suficiente pra descartar
  // lixo/injeção — não precisa validar semanticamente o endereço.
  return /^[0-9a-fA-F:.]+$/.test(v);
}
