import { buscarConfiguracaoContato } from "@/lib/configuracao-contato";
import { formatarCodigoImovel } from "@/lib/format";
import { salvarConfiguracaoContato } from "./actions";

export default async function ConfiguracoesPage() {
  const config = await buscarConfiguracaoContato();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-2">Contato e redes sociais</h1>
      <p className="text-gray-500 mb-6">
        Esses dados alimentam o botão de contato flutuante, o WhatsApp dos
        imóveis e outros pontos de contato do site público.
      </p>

      <form action={salvarConfiguracaoContato} className="space-y-6">
        <div className="border rounded-lg p-5 space-y-4">
          <h2 className="font-medium">Contato</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Telefone
              </label>
              <input
                name="telefone"
                defaultValue={config.telefone}
                placeholder="+55 (11) 3888-3000"
                className="w-full border rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                WhatsApp
              </label>
              <input
                name="whatsapp"
                defaultValue={config.whatsapp}
                placeholder="5511999998888 (DDI + DDD + número, só dígitos)"
                className="w-full border rounded-md px-3 py-2"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">
                E-mail
              </label>
              <input
                name="email"
                type="email"
                defaultValue={config.email}
                placeholder="contato@suaimobiliaria.com.br"
                className="w-full border rounded-md px-3 py-2"
              />
            </div>
          </div>
        </div>

        <div className="border rounded-lg p-5 space-y-4">
          <h2 className="font-medium">Redes sociais</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Instagram
              </label>
              <input
                name="instagram"
                defaultValue={config.instagram}
                placeholder="https://instagram.com/suaimobiliaria"
                className="w-full border rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Facebook
              </label>
              <input
                name="facebook"
                defaultValue={config.facebook}
                placeholder="https://facebook.com/suaimobiliaria"
                className="w-full border rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                YouTube
              </label>
              <input
                name="youtube"
                defaultValue={config.youtube}
                placeholder="https://youtube.com/@suaimobiliaria"
                className="w-full border rounded-md px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                LinkedIn
              </label>
              <input
                name="linkedin"
                defaultValue={config.linkedin}
                placeholder="https://linkedin.com/company/suaimobiliaria"
                className="w-full border rounded-md px-3 py-2"
              />
            </div>
          </div>
        </div>

        <div className="border rounded-lg p-5 space-y-4">
          <h2 className="font-medium">Código do imóvel</h2>
          <p className="text-sm text-gray-500">
            Os imóveis recebem um código numérico automático (ex: 100001).
            Defina um prefixo opcional para personalizar como ele é exibido.
          </p>
          <div>
            <label className="block text-sm font-medium mb-1">Prefixo</label>
            <input
              name="codigoImovelPrefixo"
              defaultValue={config.codigoImovelPrefixo}
              placeholder="Ex: IMB"
              maxLength={10}
              className="w-full sm:w-48 border rounded-md px-3 py-2 uppercase placeholder:normal-case"
            />
            <p className="text-xs text-gray-400 mt-1">
              Ficará assim:{" "}
              {formatarCodigoImovel(100001, config.codigoImovelPrefixo || null)}
            </p>
          </div>
        </div>

        <button
          type="submit"
          className="bg-black text-white rounded-md px-6 py-2 font-medium hover:bg-gray-800 active:bg-gray-900 transition-colors"
        >
          Salvar
        </button>
      </form>
    </div>
  );
}
