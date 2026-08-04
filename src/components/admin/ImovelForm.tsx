import {
  ESTAGIO_OBRA_LABEL,
  FINALIDADE_LABEL,
  STATUS_IMOVEL_LABEL,
  TIPO_IMOVEL_LABEL,
} from "@/lib/format";
import { MediaUploader, type MidiaItem } from "@/components/admin/MediaUploader";
import { CamposEndereco } from "@/components/admin/CamposEndereco";
import { SeletorCaracteristicas } from "@/components/admin/SeletorCaracteristicas";

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
}: {
  action: (formData: FormData) => void;
  valoresIniciais?: Partial<ImovelFormValues>;
  midiasIniciais?: MidiaItem[];
  opcoesCaracteristicasImovel?: string[];
  opcoesCaracteristicasCondominio?: string[];
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

  return (
    <form action={action} className="space-y-6 max-w-3xl">
      <div>
        <label className="block text-sm font-medium mb-1">Título</label>
        <input
          name="titulo"
          defaultValue={v.titulo ?? ""}
          required
          className="w-full border rounded-md px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Descrição</label>
        <textarea
          name="descricao"
          defaultValue={v.descricao ?? ""}
          rows={4}
          className="w-full border rounded-md px-3 py-2"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Tipo</label>
          <select
            name="tipo"
            defaultValue={v.tipo ?? "APARTAMENTO"}
            className="w-full border rounded-md px-3 py-2"
          >
            {Object.entries(TIPO_IMOVEL_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Finalidade</label>
          <select
            name="finalidade"
            defaultValue={v.finalidade ?? "VENDA"}
            className="w-full border rounded-md px-3 py-2"
          >
            {Object.entries(FINALIDADE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <select
            name="status"
            defaultValue={v.status ?? "RASCUNHO"}
            className="w-full border rounded-md px-3 py-2"
          >
            {Object.entries(STATUS_IMOVEL_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Rótulos</label>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="lancamento"
              defaultChecked={v.lancamento ?? false}
            />
            Lançamento
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="destaque"
              defaultChecked={v.destaque ?? false}
            />
            Destaque
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="oportunidade"
              defaultChecked={v.oportunidade ?? false}
            />
            Oportunidade
          </label>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="slideshow"
          defaultChecked={v.slideshow ?? false}
        />
        Adicionar ao slideshow da página inicial
      </label>

      <div>
        <label className="block text-sm font-medium mb-1">
          Construtora/Incorporadora
        </label>
        <input
          name="construtora"
          defaultValue={v.construtora ?? ""}
          placeholder="Ex: Cyrela"
          className="w-full border rounded-md px-3 py-2"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Evolução da obra
          </label>
          <select
            name="estagioObra"
            defaultValue={v.estagioObra ?? ""}
            className="w-full border rounded-md px-3 py-2"
          >
            <option value="">Não se aplica</option>
            {Object.entries(ESTAGIO_OBRA_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Previsão de entrega
          </label>
          <input
            name="previsaoEntrega"
            type="month"
            defaultValue={
              v.previsaoEntrega
                ? `${v.previsaoEntrega.getUTCFullYear()}-${String(
                    v.previsaoEntrega.getUTCMonth() + 1
                  ).padStart(2, "0")}`
                : ""
            }
            className="w-full border rounded-md px-3 py-2"
          />
          <p className="text-xs text-gray-500 mt-1">
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
        <div>
          <label className="block text-sm font-medium mb-1">
            Preço de venda (R$)
          </label>
          <input
            name="preco"
            type="number"
            step="0.01"
            defaultValue={v.preco ? String(v.preco) : ""}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Preço de aluguel (R$/mês)
          </label>
          <input
            name="precoAluguel"
            type="number"
            step="0.01"
            defaultValue={v.precoAluguel ? String(v.precoAluguel) : ""}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Condomínio (R$)
          </label>
          <input
            name="precoCondominio"
            type="number"
            step="0.01"
            defaultValue={v.precoCondominio ? String(v.precoCondominio) : ""}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">IPTU (R$)</label>
          <input
            name="precoIptu"
            type="number"
            step="0.01"
            defaultValue={v.precoIptu ? String(v.precoIptu) : ""}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Área total (m²)</label>
          <input
            name="areaTotal"
            type="number"
            step="0.01"
            defaultValue={v.areaTotal ?? ""}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Área privativa (m²)</label>
          <input
            name="areaPrivativa"
            type="number"
            step="0.01"
            defaultValue={v.areaPrivativa ?? ""}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Quartos</label>
          <input
            name="quartos"
            type="number"
            defaultValue={v.quartos ?? ""}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Suítes</label>
          <input
            name="suites"
            type="number"
            defaultValue={v.suites ?? ""}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Banheiros</label>
          <input
            name="banheiros"
            type="number"
            defaultValue={v.banheiros ?? ""}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Vagas</label>
          <input
            name="vagasGaragem"
            type="number"
            defaultValue={v.vagasGaragem ?? ""}
            className="w-full border rounded-md px-3 py-2"
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

      <button
        type="submit"
        className="bg-black text-white rounded-md px-6 py-2 font-medium hover:bg-gray-800 active:bg-gray-900 transition-colors"
      >
        Salvar imóvel
      </button>
    </form>
  );
}
