// Validação de URL de mídia vinda de formulário administrativo.
//
// Todo upload do painel passa por /api/admin/upload, que autentica,
// checa papel por pasta, valida o arquivo e devolve uma URL sob
// R2_PUBLIC_URL. O campo escondido do formulário carrega essa URL de
// volta — e, como qualquer campo de formulário, uma chamada direta à
// Server Action poderia enviar outra coisa no lugar.
//
// Reaproveita R2_IMAGE_HOST (security-headers.ts), que já deriva o host
// do R2 da mesma variável de ambiente usada pela CSP. Sem duplicar
// configuração: se a CSP permite carregar imagem daquele host, é dele
// que as URLs salvas devem vir.
import { R2_IMAGE_HOST } from "@/lib/security-headers";

// true quando a URL pode ser persistida como mídia do produto.
//
// Sem R2_PUBLIC_URL configurado (ambiente de desenvolvimento/teste sem
// storage), não há host conhecido para comparar e a validação não
// bloqueia nada — travar tudo aí quebraria o desenvolvimento local sem
// ganhar segurança em produção, que é onde a variável existe.
export function urlDeUploadValida(valor: string | null | undefined): boolean {
  if (!valor) return true; // ausência de foto é sempre válida
  if (!R2_IMAGE_HOST) return true;
  try {
    const url = new URL(valor);
    return url.protocol === "https:" && url.hostname === R2_IMAGE_HOST.hostname;
  } catch {
    // Não é URL absoluta: rejeita. Todo upload devolve URL absoluta.
    return false;
  }
}
