"use client";

import { useActionState } from "react";
import { FINALIDADE_LABEL, STATUS_IMOVEL_LABEL } from "@/lib/format";
import { ESTADO_INICIAL_ACAO, type ActionState } from "@/lib/action-result";
import { MediaUploader, type MidiaItem } from "@/components/admin/MediaUploader";
import {
  MateriaisUploader,
  type MaterialItem,
} from "@/components/admin/MateriaisUploader";
import { CamposEndereco } from "@/components/admin/CamposEndereco";
import { SeletorCaracteristicas } from "@/components/admin/SeletorCaracteristicas";
import { SecaoLancamentoFields } from "@/components/admin/SecaoLancamentoFields";
import { BotaoSalvarImovel } from "@/components/admin/BotaoSalvarImovel";
import { CampoMoeda } from "@/components/admin/CampoMoeda";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { LocaisProximosEditor } from "@/components/admin/LocaisProximosEditor";
import type { LocalProximo } from "@/lib/locais-proximos";
import {
  LIMITE_FRASE_DESTAQUE,
  LIMITE_OBSERVACAO_VALOR,
  LIMITE_SUBTITULO_DESTAQUE,
  LIMITE_TITULO_DESTAQUE,
} from "@/lib/property-mapper";
import {
  SEM_EMPREENDIMENTO,
  ROTULO_SEM_EMPREENDIMENTO,
  type OpcaoEmpreendimento,
} from "@/lib/empreendimento";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MAX_DESTAQUES_HOME, type OcupacaoVitrine } from "@/lib/vitrine-home";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ImovelFormValues = {
  /** Fase 45 — título/subtítulo exibidos sobre a foto de destaque. */
  tituloDestaque: string | null;
  subtituloDestaque: string | null;
  /** Fase 40 — frase editorial opcional, exibida abaixo da descrição. */
  fraseDestaque: string | null;
  /** Fase 54 — observação opcional exibida logo abaixo do valor. */
  observacaoValor: string | null;
  /** Fase 38 — id do empreendimento, ou ausente para unidade avulsa. */
  empreendimentoId: string | null;
  titulo: string;
  descricao: string | null;
  tipo: string;
  finalidade: string;
  status: string;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string;
  cidade: string;
  estado: string;
  latitude: number | null;
  longitude: number | null;
  preco: unknown;
  precoAluguel: unknown;
  precoCondominio: unknown;
  precoIptu: unknown;
  areaTotal: number | null;
  areaPrivativa: number | null;
  quartos: number | null;
  suites: number | null;
  banheiros: number | null;
  vagasGaragem: number | null;
  caracteristicasImovel: string[];
  caracteristicasCondominio: string[];
  lancamento: boolean;
  destaque: boolean;
  oportunidade: boolean;
  posicaoDestaqueHome: number | null;
  slideshow: boolean;
  estagioObra: string | null;
  previsaoEntrega: Date | null;
  construtora: string | null;
};

function mesclarOpcoes(catalogo: string[], selecionadas: string[]) {
  const extras = selecionadas.filter((nome) => !catalogo.includes(nome));
  return [...catalogo, ...extras];
}

export function ImovelForm({
  action,
  valoresIniciais,
  midiasIniciais,
  materiaisIniciais,
  locaisProximosIniciais,
  propertyId,
  opcoesCaracteristicasImovel = [],
  opcoesCaracteristicasCondominio = [],
  opcoesEmpreendimento = [],
  opcoesTiposResidencial = [],
  opcoesTiposComercial = [],
  ocupacaoVitrine = [],
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  valoresIniciais?: Partial<ImovelFormValues>;
  midiasIniciais?: MidiaItem[];
  materiaisIniciais?: MaterialItem[];
  /** Fase 42 — o que tem por perto, na ordem salva. */
  locaisProximosIniciais?: LocalProximo[];
  /** Id do imóvel sendo editado, se já existir (imóvel novo ainda não tem id). */
  propertyId?: string;
  opcoesCaracteristicasImovel?: string[];
  opcoesCaracteristicasCondominio?: string[];
  /** Fase 38 — empreendimentos da organização, para o vínculo da unidade. */
  opcoesEmpreendimento?: OpcaoEmpreendimento[];
  opcoesTiposResidencial?: string[];
  opcoesTiposComercial?: string[];
  /** Quem ocupa cada uma das quatro posições da vitrine da Home hoje. */
  ocupacaoVitrine?: OcupacaoVitrine[];
}) {
  const [estado, formAction] = useActionState(action, ESTADO_INICIAL_ACAO);
  const v = valoresIniciais ?? {};
  const todasOpcoesImovel = mesclarOpcoes(
    opcoesCaracteristicasImovel,
    v.caracteristicasImovel ?? []
  );
  const todasOpcoesCondominio = mesclarOpcoes(
    opcoesCaracteristicasCondominio,
    v.caracteristicasCondominio ?? []
  );
  const tipoOrfao =
    v.tipo &&
    !opcoesTiposResidencial.includes(v.tipo) &&
    !opcoesTiposComercial.includes(v.tipo)
      ? v.tipo
      : null;

  // Mesmo padrão das telas de Configurações: o formulário é uma pilha de
  // CARDS, um por assunto, cada um com título e uma linha dizendo o que
  // aquele bloco decide. Antes era uma coluna única com vinte e poucos
  // campos seguidos, sem hierarquia — a mesma informação, mas sem nada
  // que dissesse onde um assunto termina e outro começa.
  //
  // Nenhum campo mudou de nome, de valor padrão ou de ordem: isto é
  // reorganização visual, e o que a action recebe continua idêntico.
  return (
    <form action={formAction} className="space-y-5">
      {estado.message && !estado.success && (
        <Alert variant="destructive">
          <AlertDescription>{estado.message}</AlertDescription>
        </Alert>
      )}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Identificação</CardTitle>
          <CardDescription className="min-w-0 break-words">
            Como o imóvel é apresentado e em que situação ele está.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="titulo">Título</Label>
            <Input id="titulo" name="titulo" defaultValue={v.titulo ?? ""} required />
            <ErroCampo erros={estado.fieldErrors?.titulo} />
          </div>

          {/* Fase 38 — a que EMPREENDIMENTO esta unidade pertence.
              Fica em Identificação, junto de tipo e finalidade: é o que
              o imóvel É, não como ele é divulgado.

              SELETOR, nunca texto livre: o vínculo é um ID estrutural, e
              digitar o nome criaria empreendimentos fantasma a cada
              typo. Quem não vê o empreendimento na lista cadastra
              primeiro em Empreendimentos — é uma ida a mais, e é o preço
              de a identidade ser confiável.

              <select> NATIVO, e não o Select do design system: é a mesma
              escolha de SeletorResponsavel, pelo mesmo motivo estrutural
              — aqui o VALOR é um id e o RÓTULO é o nome, e o Select do
              projeto exibe o valor cru quando os dois diferem (nos
              outros campos do formulário valor e rótulo são iguais, o
              que mascara a diferença). Achado real: o gatilho mostrava
              o cuid do empreendimento em vez do nome. */}
          <div className="space-y-1.5">
            <Label htmlFor="empreendimentoId">Empreendimento</Label>
            <select
              id="empreendimentoId"
              name="empreendimentoId"
              defaultValue={v.empreendimentoId ?? SEM_EMPREENDIMENTO}
              className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {/* "Sem empreendimento" é uma escolha declarada, e o
                  estado de toda unidade avulsa. */}
              <option value={SEM_EMPREENDIMENTO}>{ROTULO_SEM_EMPREENDIMENTO}</option>
              {opcoesEmpreendimento.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Agrupa esta unidade com as outras do mesmo empreendimento na
              página pública. Cadastre em Empreendimentos para que apareça aqui.
            </p>
            <ErroCampo erros={estado.fieldErrors?.empreendimentoId} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
          id="descricao"
          name="descricao"
          defaultValue={v.descricao ?? ""}
          rows={4}
            />
            <ErroCampo erros={estado.fieldErrors?.descricao} />
          </div>

          {/* Fase 40 — logo DEPOIS da descrição, que é a ordem em que os
              dois aparecem na ficha pública: primeiro o texto que explica
              o imóvel, depois a frase que destaca um ponto dele.

              Textarea de 2 linhas: é uma frase, e um input de uma linha
              esconderia o fim do texto enquanto se digita. maxLength usa
              a MESMA constante do schema — o servidor é quem recusa de
              verdade, isto só evita a viagem. */}
          <div className="space-y-1.5">
            <Label htmlFor="fraseDestaque">Frase de destaque</Label>
            <Textarea
              id="fraseDestaque"
              name="fraseDestaque"
              defaultValue={v.fraseDestaque ?? ""}
              rows={2}
              maxLength={LIMITE_FRASE_DESTAQUE}
              placeholder="Ex.: Vista livre e iluminação natural durante todo o dia."
            />
            <p className="text-xs text-muted-foreground">
              Uma frase curta para destacar o principal diferencial do imóvel.
              Opcional — sem ela, nada aparece na ficha. Máximo de{" "}
              {LIMITE_FRASE_DESTAQUE} caracteres.
            </p>
            <ErroCampo erros={estado.fieldErrors?.fraseDestaque} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
          <Label htmlFor="tipo">Tipo</Label>
          <Select
            name="tipo"
            defaultValue={v.tipo ?? opcoesTiposResidencial[0] ?? ""}
          >
            <SelectTrigger id="tipo" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tipoOrfao && <SelectItem value={tipoOrfao}>{tipoOrfao}</SelectItem>}
              <SelectGroup>
                <SelectLabel>Residencial</SelectLabel>
                {opcoesTiposResidencial.map((nome) => (
                  <SelectItem key={nome} value={nome}>
                    {nome}
                  </SelectItem>
                ))}
              </SelectGroup>
              <SelectGroup>
                <SelectLabel>Comercial</SelectLabel>
                {opcoesTiposComercial.map((nome) => (
                  <SelectItem key={nome} value={nome}>
                    {nome}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <ErroCampo erros={estado.fieldErrors?.tipo} />
            </div>
            <div className="space-y-1.5">
          <Label htmlFor="finalidade">Finalidade</Label>
          <Select name="finalidade" defaultValue={v.finalidade ?? "SALE"}>
            <SelectTrigger id="finalidade" className="w-full">
              <SelectValue>
                {(valor: string) => FINALIDADE_LABEL[valor] ?? valor}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FINALIDADE_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
            </div>
            <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select name="status" defaultValue={v.status ?? "DRAFT"}>
            <SelectTrigger id="status" className="w-full">
              <SelectValue>
                {(valor: string) => STATUS_IMOVEL_LABEL[valor] ?? valor}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_IMOVEL_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
            </div>
          </div>

        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Divulgação</CardTitle>
          <CardDescription className="min-w-0 break-words">
            Onde este imóvel aparece no site e com quais selos.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-6">
          {/* "Lançamento" saiu deste grupo e virou seção própria (abaixo),
          junto dos campos que só existem por causa dele. Aqui ficam os
          rótulos que são só marcação comercial, sem campo associado. */}
          {/* Vitrine editorial da Home — separada dos "Rótulos" abaixo de
          propósito: aqueles marcam o imóvel (badge, filtro), este decide
          o que a página inicial mostra. Um select, e não um checkbox,
          porque a escolha carrega a ORDEM junto: selecionar e ordenar
          numa interação só, sem arrastar nada. */}
          <div>
            <Label className="mb-2" htmlFor="posicaoDestaqueHome">
          Página inicial
            </Label>
            <select
          id="posicaoDestaqueHome"
          name="posicaoDestaqueHome"
          defaultValue={v.posicaoDestaqueHome ? String(v.posicaoDestaqueHome) : ""}
          className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:max-w-sm"
            >
          <option value="">Não exibir na página inicial</option>
          {ocupacaoVitrine.map(({ posicao, imovel }) => {
            const ehEsteImovel = imovel !== null && imovel.id === propertyId;
            // A ocupação é dita em texto: trocar a vitrine não pode
            // derrubar o imóvel de outra pessoa sem que quem escolheu
            // veja de quem era a vaga.
            const sufixo = !imovel
              ? "livre"
              : ehEsteImovel
                ? "atual"
                : `ocupada por ${imovel.title}`;
            return (
              <option key={posicao} value={String(posicao)}>
                {`${posicao}ª posição — ${sufixo}`}
              </option>
            );
          })}
            </select>
            <p className="mt-1 text-xs text-muted-foreground">
          A página inicial exibe até {MAX_DESTAQUES_HOME} imóveis em destaque, na ordem
          escolhida aqui. Só aparecem os que estiverem disponíveis.
            </p>
          </div>

          <div>
            <Label className="mb-2">Rótulos</Label>
            <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="destaque" defaultChecked={v.destaque ?? false} />
            Destaque
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              name="oportunidade"
              defaultChecked={v.oportunidade ?? false}
            />
            Oportunidade
          </label>
            </div>
          </div>

          <SecaoLancamentoFields
            valores={{
          lancamento: v.lancamento,
          construtora: v.construtora,
          estagioObra: v.estagioObra,
          previsaoEntrega: v.previsaoEntrega,
            }}
          />

          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="slideshow" defaultChecked={v.slideshow ?? false} />
            Adicionar ao slideshow da página inicial
          </label>

        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Endereço</CardTitle>
          <CardDescription className="min-w-0 break-words">
            Onde o imóvel fica. Define bairro e cidade nos filtros do site.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <CamposEndereco
            valoresIniciais={{
          cep: v.cep,
          logradouro: v.logradouro,
          numero: v.numero,
          complemento: v.complemento,
          bairro: v.bairro,
          cidade: v.cidade,
          estado: v.estado,
          latitude: v.latitude,
          longitude: v.longitude,
            }}
            erros={estado.fieldErrors}
          />

        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Valores</CardTitle>
          <CardDescription className="min-w-0 break-words">
            O site mostra o preço da finalidade escolhida acima.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="space-y-1.5">
          <Label htmlFor="preco">Preço de venda (R$)</Label>
          <CampoMoeda
            id="preco"
            name="preco"
            defaultValue={v.preco ? String(v.preco) : null}
            className="w-full border rounded-md px-3 py-2"
          />
          <ErroCampo erros={estado.fieldErrors?.preco} />
            </div>
            <div className="space-y-1.5">
          <Label htmlFor="precoAluguel">Preço de aluguel (R$/mês)</Label>
          <CampoMoeda
            id="precoAluguel"
            name="precoAluguel"
            defaultValue={v.precoAluguel ? String(v.precoAluguel) : null}
            className="w-full border rounded-md px-3 py-2"
          />
          <ErroCampo erros={estado.fieldErrors?.precoAluguel} />
            </div>
            <div className="space-y-1.5">
          <Label htmlFor="precoCondominio">Condomínio (R$)</Label>
          <CampoMoeda
            id="precoCondominio"
            name="precoCondominio"
            defaultValue={v.precoCondominio ? String(v.precoCondominio) : null}
            className="w-full border rounded-md px-3 py-2"
          />
          <ErroCampo erros={estado.fieldErrors?.precoCondominio} />
            </div>
            <div className="space-y-1.5">
          <Label htmlFor="precoIptu">IPTU (R$)</Label>
          <CampoMoeda
            id="precoIptu"
            name="precoIptu"
            defaultValue={v.precoIptu ? String(v.precoIptu) : null}
            className="w-full border rounded-md px-3 py-2"
          />
          <ErroCampo erros={estado.fieldErrors?.precoIptu} />
            </div>
          </div>

          {/* Fase 54 — observação sobre o valor. Fica AQUI, no card dos
              preços, porque é sobre eles: na ficha pública ela aparece
              colada no valor. Texto do anunciante — o sistema não calcula
              valorização nem sugere condição comercial, e o campo começa
              vazio sempre (o placeholder é exemplo, não valor inicial). */}
          <div className="mt-4 space-y-1.5">
            <Label htmlFor="observacaoValor">Observação sobre o valor</Label>
            <Input
              id="observacaoValor"
              name="observacaoValor"
              defaultValue={v.observacaoValor ?? ""}
              maxLength={LIMITE_OBSERVACAO_VALOR}
              placeholder="Ex.: Previsão de valorização: +25% até a entrega"
            />
            <p className="text-xs text-muted-foreground">
              Texto opcional exibido logo abaixo do valor na página pública do
              imóvel. Máximo de {LIMITE_OBSERVACAO_VALOR} caracteres.
            </p>
            <ErroCampo erros={estado.fieldErrors?.observacaoValor} />
          </div>

        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Medidas e cômodos</CardTitle>
          <CardDescription className="min-w-0 break-words">
            Alimentam os filtros de área, dormitórios e vagas do site.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
          <Label htmlFor="areaTotal">Área total (m²)</Label>
          <Input
            id="areaTotal"
            name="areaTotal"
            type="number"
            step="0.01"
            defaultValue={v.areaTotal ?? ""}
          />
            </div>
            <div className="space-y-1.5">
          <Label htmlFor="areaPrivativa">Área privativa (m²)</Label>
          <Input
            id="areaPrivativa"
            name="areaPrivativa"
            type="number"
            step="0.01"
            defaultValue={v.areaPrivativa ?? ""}
          />
            </div>
            <div className="space-y-1.5">
          <Label htmlFor="quartos">Quartos</Label>
          <Input
            id="quartos"
            name="quartos"
            type="number"
            defaultValue={v.quartos ?? ""}
          />
            </div>
            <div className="space-y-1.5">
          <Label htmlFor="suites">Suítes</Label>
          <Input
            id="suites"
            name="suites"
            type="number"
            defaultValue={v.suites ?? ""}
          />
            </div>
            <div className="space-y-1.5">
          <Label htmlFor="banheiros">Banheiros</Label>
          <Input
            id="banheiros"
            name="banheiros"
            type="number"
            defaultValue={v.banheiros ?? ""}
          />
            </div>
            <div className="space-y-1.5">
          <Label htmlFor="vagasGaragem">Vagas</Label>
          <Input
            id="vagasGaragem"
            name="vagasGaragem"
            type="number"
            defaultValue={v.vagasGaragem ?? ""}
          />
            </div>
          </div>

        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Características</CardTitle>
          <CardDescription className="min-w-0 break-words">
            O que o imóvel e o condomínio oferecem. Viram filtros no site.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <SeletorCaracteristicas
          nome="caracteristicasImovel"
          titulo="Características do imóvel"
          opcoes={todasOpcoesImovel}
          selecionadas={v.caracteristicasImovel ?? []}
            />
            <SeletorCaracteristicas
          nome="caracteristicasCondominio"
          titulo="Características do condomínio"
          opcoes={todasOpcoesCondominio}
          selecionadas={v.caracteristicasCondominio ?? []}
            />
          </div>

        </CardContent>
      </Card>

      {/* Fotos e materiais eram separados por uma linha (`border-t`), que
          é o mesmo recurso que as Configurações usam DENTRO de um card
          para dividir assuntos próximos. Aqui são assuntos inteiros, e
          viram cards como os demais. */}
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Fotos</CardTitle>
          <CardDescription className="min-w-0 break-words">
            A primeira foto é a capa nas listagens e no compartilhamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0 space-y-6">
          {/* Fase 45 — conteúdo da FOTO DE DESTAQUE. Fica aqui, junto da
              explicação da capa, e acima da lista de fotos de propósito:
              pertence ao imóvel, não a uma foto — trocar a capa não muda
              este texto. Separado da lista por uma linha, como as
              Configurações dividem assuntos próximos dentro de um card. */}
          <div data-conteudo-destaque className="min-w-0 space-y-4 border-b pb-6">
            <div className="space-y-1">
              <p className="text-sm font-medium">Conteúdo da foto de destaque</p>
              <p className="text-xs text-muted-foreground">
                Exibidos sobre a foto de destaque na página pública. Em
                lançamentos, a previsão de entrega informada em Divulgação
                também aparece sobre ela.
              </p>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="tituloDestaque">Título (opcional)</Label>
                <Input
                  id="tituloDestaque"
                  name="tituloDestaque"
                  defaultValue={v.tituloDestaque ?? ""}
                  maxLength={LIMITE_TITULO_DESTAQUE}
                  placeholder="Ex.: Um novo jeito de viver no bairro"
                  autoComplete="off"
                />
                <ErroCampo erros={estado.fieldErrors?.tituloDestaque} />
              </div>
              <div className="min-w-0 space-y-1.5">
                <Label htmlFor="subtituloDestaque">Subtítulo (opcional)</Label>
                {/* Duas linhas: com até 160 caracteres, um campo de uma
                    linha esconderia o fim do texto. Quebras digitadas
                    viram espaço no servidor. */}
                <Textarea
                  id="subtituloDestaque"
                  name="subtituloDestaque"
                  defaultValue={v.subtituloDestaque ?? ""}
                  maxLength={LIMITE_SUBTITULO_DESTAQUE}
                  rows={2}
                  placeholder="Ex.: Conforto, lazer e boa localização."
                />
                <ErroCampo erros={estado.fieldErrors?.subtituloDestaque} />
              </div>
            </div>
          </div>

          <MediaUploader midiasIniciais={midiasIniciais} propertyId={propertyId} />
          <ErroCampo erros={estado.fieldErrors?.midiasJson} />
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">Materiais de apresentação</CardTitle>
          <CardDescription className="min-w-0 break-words">
            Book, plantas e tabelas — entregues no site após o visitante se identificar.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <MateriaisUploader
            materiaisIniciais={materiaisIniciais}
            propertyId={propertyId}
          />
        </CardContent>
      </Card>

      {/* Mesma anatomia do card de Características: título, uma linha do
          que o bloco decide e o editor direto no conteúdo, sem card
          dentro de card. */}
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 break-words">O que tem por perto</CardTitle>
          <CardDescription className="min-w-0 break-words">
            Cadastre os principais serviços, comércios e pontos de interesse próximos ao imóvel.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          <LocaisProximosEditor
            locaisIniciais={locaisProximosIniciais}
            erros={estado.fieldErrors?.locaisProximos}
          />
        </CardContent>
      </Card>

      <BotaoSalvarImovel />
    </form>
  );
}
