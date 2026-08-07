import {
  ESTAGIO_OBRA_LABEL,
  FINALIDADE_LABEL,
  STATUS_IMOVEL_LABEL,
} from "@/lib/format";
import { MediaUploader, type MidiaItem } from "@/components/admin/MediaUploader";
import { CamposEndereco } from "@/components/admin/CamposEndereco";
import { SeletorCaracteristicas } from "@/components/admin/SeletorCaracteristicas";
import { BotaoSalvarImovel } from "@/components/admin/BotaoSalvarImovel";
import { CampoMoeda } from "@/components/admin/CampoMoeda";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  opcoesCaracteristicasImovel = [],
  opcoesCaracteristicasCondominio = [],
  opcoesTiposResidencial = [],
  opcoesTiposComercial = [],
}: {
  action: (formData: FormData) => void;
  valoresIniciais?: Partial<ImovelFormValues>;
  midiasIniciais?: MidiaItem[];
  opcoesCaracteristicasImovel?: string[];
  opcoesCaracteristicasCondominio?: string[];
  opcoesTiposResidencial?: string[];
  opcoesTiposComercial?: string[];
}) {
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

  return (
    <form action={action} className="space-y-6 max-w-3xl">
      <div className="space-y-1.5">
        <Label htmlFor="titulo">Título</Label>
        <Input id="titulo" name="titulo" defaultValue={v.titulo ?? ""} required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea
          id="descricao"
          name="descricao"
          defaultValue={v.descricao ?? ""}
          rows={4}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
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
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="finalidade">Finalidade</Label>
          <Select name="finalidade" defaultValue={v.finalidade ?? "SALE"}>
            <SelectTrigger id="finalidade" className="w-full">
              <SelectValue />
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
              <SelectValue />
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

      <div>
        <Label className="mb-2">Rótulos</Label>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="lancamento" defaultChecked={v.lancamento ?? false} />
            Lançamento
          </label>
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

      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="slideshow" defaultChecked={v.slideshow ?? false} />
        Adicionar ao slideshow da página inicial
      </label>

      <div className="space-y-1.5">
        <Label htmlFor="construtora">Construtora/Incorporadora</Label>
        <Input
          id="construtora"
          name="construtora"
          defaultValue={v.construtora ?? ""}
          placeholder="Ex: Cyrela"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="estagioObra">Evolução da obra</Label>
          <Select name="estagioObra" defaultValue={v.estagioObra ?? ""}>
            <SelectTrigger id="estagioObra" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Não se aplica</SelectItem>
              {Object.entries(ESTAGIO_OBRA_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="previsaoEntrega">Previsão de entrega</Label>
          <Input
            id="previsaoEntrega"
            name="previsaoEntrega"
            type="month"
            defaultValue={
              v.previsaoEntrega
                ? `${v.previsaoEntrega.getUTCFullYear()}-${String(
                    v.previsaoEntrega.getUTCMonth() + 1
                  ).padStart(2, "0")}`
                : ""
            }
          />
          <p className="text-xs text-muted-foreground">
            Usada quando o estágio ainda não é &quot;Pronto para morar&quot;.
          </p>
        </div>
      </div>

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
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="preco">Preço de venda (R$)</Label>
          <CampoMoeda
            id="preco"
            name="preco"
            defaultValue={v.preco ? String(v.preco) : null}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="precoAluguel">Preço de aluguel (R$/mês)</Label>
          <CampoMoeda
            id="precoAluguel"
            name="precoAluguel"
            defaultValue={v.precoAluguel ? String(v.precoAluguel) : null}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="precoCondominio">Condomínio (R$)</Label>
          <CampoMoeda
            id="precoCondominio"
            name="precoCondominio"
            defaultValue={v.precoCondominio ? String(v.precoCondominio) : null}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="precoIptu">IPTU (R$)</Label>
          <CampoMoeda
            id="precoIptu"
            name="precoIptu"
            defaultValue={v.precoIptu ? String(v.precoIptu) : null}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
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

      <div className="border-t pt-6">
        <MediaUploader midiasIniciais={midiasIniciais} />
      </div>

      <BotaoSalvarImovel />
    </form>
  );
}
