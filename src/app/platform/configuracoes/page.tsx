import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { telefoneSuporteE164 } from "@/lib/plataforma-suporte";
import { buscarConfiguracaoSuporte } from "@/lib/plataforma-suporte-dados";
import { ConfiguracaoSuporteForm } from "./ConfiguracaoSuporteForm";

// SUP-001 (Fase 112). Valores iniciais aprovados (ver docs/operations/
// incident-response.md, seção 9): quando NÃO há linha em PlatformSettings
// ainda, pré-preenchemos o formulário com esses valores — mas NADA é
// persistido até o Super Admin confirmar clicando em "Salvar" (nunca
// grava config em silêncio). Depois da primeira gravação real, esses
// defaults nunca mais são usados — o formulário sempre reflete o banco.
const TELEFONE_APROVADO_INICIAL = "11976069213";
const HORARIO_APROVADO_INICIAL = "Segunda a sexta, 9h às 18h";

export default async function PlatformConfiguracoesPage() {
  const config = await buscarConfiguracaoSuporte();

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Configurações</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Suporte oficial do SaaS</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Telefone e horário mostrados como contato oficial do produto — nunca confundir com o
            telefone comercial de cada imobiliária (isso é configurado por cada organização, em{" "}
            <code>/app/configuracoes</code>).
          </p>
          <ConfiguracaoSuporteForm
            telefoneInicial={
              config.telefoneDigitos
                ? config.telefoneDigitos.slice(2) // sem o "55" — o form reaplica o DDI
                : TELEFONE_APROVADO_INICIAL
            }
            horarioInicial={config.horarioAtendimento ?? HORARIO_APROVADO_INICIAL}
            telefoneE164Atual={
              config.telefoneDigitos ? telefoneSuporteE164(config.telefoneDigitos) : null
            }
            configuradoAnteriormente={config.telefoneDigitos !== null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
