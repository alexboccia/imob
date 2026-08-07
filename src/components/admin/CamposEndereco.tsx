"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ESTADOS_BRASIL } from "@/lib/estados-brasil";
import { ErroCampo } from "@/components/admin/ErroCampo";

const MapaLocalizacao = dynamic(
  () => import("@/components/admin/MapaLocalizacao").then((m) => m.MapaLocalizacao),
  {
    ssr: false,
    loading: () => (
      <div className="h-[260px] bg-gray-100 rounded-lg animate-pulse" />
    ),
  }
);

const POSICAO_PADRAO: [number, number] = [-23.5505, -46.6333];

type ValoresEndereco = {
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string;
  cidade?: string;
  estado?: string;
  latitude?: number | null;
  longitude?: number | null;
};

function formatarCep(valor: string) {
  const digitos = valor.replace(/\D/g, "").slice(0, 8);
  if (digitos.length <= 5) return digitos;
  return `${digitos.slice(0, 5)}-${digitos.slice(5)}`;
}

export function CamposEndereco({
  valoresIniciais,
  erros,
}: {
  valoresIniciais?: ValoresEndereco;
  erros?: Record<string, string[]>;
}) {
  const v = valoresIniciais ?? {};
  const [cep, setCep] = useState(formatarCep(v.cep ?? ""));
  const [logradouro, setLogradouro] = useState(v.logradouro ?? "");
  const [numero, setNumero] = useState(v.numero ?? "");
  const [complemento, setComplemento] = useState(v.complemento ?? "");
  const [bairro, setBairro] = useState(v.bairro ?? "");
  const [cidade, setCidade] = useState(v.cidade ?? "");
  const [estado, setEstado] = useState(v.estado ?? "");
  const [cidades, setCidades] = useState<string[]>([]);
  const [bairros, setBairros] = useState<string[]>([]);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [latitude, setLatitude] = useState(
    v.latitude != null ? String(v.latitude) : ""
  );
  const [longitude, setLongitude] = useState(
    v.longitude != null ? String(v.longitude) : ""
  );
  const [buscandoCoordenadas, setBuscandoCoordenadas] = useState(false);
  const [erroGeocode, setErroGeocode] = useState<string | null>(null);
  const [mapaVersao, setMapaVersao] = useState(0);

  useEffect(() => {
    if (!estado) return;
    let cancelado = false;
    fetch(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${estado}/municipios`
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((dados: { nome: string }[]) => {
        if (!cancelado) setCidades(dados.map((d) => d.nome));
      })
      .catch(() => {
        if (!cancelado) setCidades([]);
      });
    return () => {
      cancelado = true;
    };
  }, [estado]);

  useEffect(() => {
    if (!cidade) return;
    let cancelado = false;
    fetch(`/api/admin/bairros?cidade=${encodeURIComponent(cidade)}`)
      .then((r) => (r.ok ? r.json() : { bairros: [] }))
      .then((dados: { bairros: string[] }) => {
        if (!cancelado) setBairros(dados.bairros);
      })
      .catch(() => {
        if (!cancelado) setBairros([]);
      });
    return () => {
      cancelado = true;
    };
  }, [cidade]);

  async function buscarCep() {
    const cepLimpo = cep.replace(/\D/g, "");
    if (cepLimpo.length !== 8) return;

    setBuscandoCep(true);
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const dados = await resposta.json();
      if (!dados.erro) {
        setLogradouro(dados.logradouro || "");
        setBairro(dados.bairro || "");
        setCidade(dados.localidade || "");
        setEstado(dados.uf || "");
      }
    } catch {
      // busca falhou — usuário preenche manualmente
    } finally {
      setBuscandoCep(false);
    }
  }

  async function buscarCoordenadas() {
    const enderecoTexto = [logradouro, numero, bairro, cidade, estado]
      .filter(Boolean)
      .join(", ");
    if (!enderecoTexto) {
      setErroGeocode("Preencha ao menos o bairro e a cidade primeiro.");
      return;
    }

    setBuscandoCoordenadas(true);
    setErroGeocode(null);
    try {
      const resposta = await fetch(
        `/api/admin/geocode?endereco=${encodeURIComponent(enderecoTexto)}`
      );
      const dados = await resposta.json();
      if (!resposta.ok) {
        setErroGeocode(dados.erro ?? "Não foi possível buscar coordenadas.");
        return;
      }
      setLatitude(String(dados.latitude));
      setLongitude(String(dados.longitude));
      setMapaVersao((v) => v + 1);
    } catch {
      setErroGeocode("Falha ao buscar coordenadas.");
    } finally {
      setBuscandoCoordenadas(false);
    }
  }

  const posicaoMapa: [number, number] =
    latitude && longitude
      ? [Number(latitude), Number(longitude)]
      : POSICAO_PADRAO;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">CEP</label>
          <input
            name="cep"
            value={cep}
            onChange={(e) => setCep(formatarCep(e.target.value))}
            onBlur={buscarCep}
            placeholder="00000-000"
            inputMode="numeric"
            maxLength={9}
            className="w-full border rounded-md px-3 py-2"
          />
          {buscandoCep && (
            <p className="text-xs text-gray-400 mt-1">Buscando endereço...</p>
          )}
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Logradouro</label>
          <input
            name="logradouro"
            value={logradouro}
            onChange={(e) => setLogradouro(e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Número</label>
          <input
            name="numero"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Complemento</label>
          <input
            name="complemento"
            value={complemento}
            onChange={(e) => setComplemento(e.target.value)}
            className="w-full border rounded-md px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Bairro</label>
          <input
            name="bairro"
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            list="lista-bairros"
            required
            className="w-full border rounded-md px-3 py-2"
          />
          <datalist id="lista-bairros">
            {bairros.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <ErroCampo erros={erros?.bairro} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium mb-1">Cidade</label>
            <input
              name="cidade"
              value={cidade}
              onChange={(e) => {
                setCidade(e.target.value);
                setBairros([]);
              }}
              list="lista-cidades"
              required
              className="w-full border rounded-md px-3 py-2"
            />
            <datalist id="lista-cidades">
              {cidades.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <ErroCampo erros={erros?.cidade} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">UF</label>
            <select
              name="estado"
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value);
                setCidades([]);
              }}
              required
              className="w-full border rounded-md px-3 py-2"
            >
              <option value="">UF</option>
              {ESTADOS_BRASIL.map((e) => (
                <option key={e.sigla} value={e.sigla}>
                  {e.sigla}
                </option>
              ))}
            </select>
            <ErroCampo erros={erros?.estado} />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Localização no mapa</label>
        <div className="flex items-center gap-3 mb-2">
          <button
            type="button"
            onClick={buscarCoordenadas}
            disabled={buscandoCoordenadas}
            className="border rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
          >
            {buscandoCoordenadas
              ? "Buscando..."
              : "Buscar coordenadas pelo endereço"}
          </button>
          {erroGeocode && (
            <p className="text-sm text-red-600">{erroGeocode}</p>
          )}
        </div>

        <MapaLocalizacao
          key={mapaVersao}
          latitude={posicaoMapa[0]}
          longitude={posicaoMapa[1]}
          onMudar={(lat, lng) => {
            setLatitude(String(lat));
            setLongitude(String(lng));
          }}
        />
        <p className="text-xs text-gray-500 mt-2">
          Clique no mapa ou arraste o marcador para ajustar a posição exata.
        </p>

        <div className="grid grid-cols-2 gap-4 mt-3">
          <div>
            <label className="block text-sm font-medium mb-1">Latitude</label>
            <input
              name="latitude"
              type="number"
              step="0.000001"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="-23.561684"
              className="w-full border rounded-md px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Longitude</label>
            <input
              name="longitude"
              type="number"
              step="0.000001"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="-46.655981"
              className="w-full border rounded-md px-3 py-2"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
