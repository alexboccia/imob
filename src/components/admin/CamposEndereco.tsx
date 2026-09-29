"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ESTADOS_BRASIL } from "@/lib/estados-brasil";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    if (!bairro || !cidade) {
      setErroGeocode("Preencha ao menos o bairro e a cidade primeiro.");
      return;
    }

    setBuscandoCoordenadas(true);
    setErroGeocode(null);
    try {
      const params = new URLSearchParams({
        logradouro,
        numero,
        bairro,
        cidade,
        estado,
      });
      const resposta = await fetch(`/api/admin/geocode?${params.toString()}`);
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
      {/* grid-cols-4 sem breakpoint espremia CEP/Logradouro/Número (achado
          real: Cidade/UF chegavam a ~30px de largura em 390px, campo
          inutilizável, embora sem overflow de documento — minmax(0,1fr)
          encolhe em vez de estourar). lg: (1024px), não sm:/md: — medido:
          em 768px 1/4 de linha dividido ainda pela metade (Cidade/UF)
          continuava com a mesma largura inutilizável. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="cep">CEP</Label>
          <Input
            id="cep"
            name="cep"
            value={cep}
            onChange={(e) => setCep(formatarCep(e.target.value))}
            onBlur={buscarCep}
            placeholder="00000-000"
            inputMode="numeric"
            maxLength={9}
          />
          {buscandoCep && (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Buscando endereço...
            </p>
          )}
        </div>
        <div className="lg:col-span-2 space-y-1.5">
          <Label htmlFor="logradouro">Logradouro</Label>
          <Input
            id="logradouro"
            name="logradouro"
            value={logradouro}
            onChange={(e) => setLogradouro(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="numero">Número</Label>
          <Input
            id="numero"
            name="numero"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="lg:col-span-2 space-y-1.5">
          <Label htmlFor="complemento">Complemento</Label>
          <Input
            id="complemento"
            name="complemento"
            value={complemento}
            onChange={(e) => setComplemento(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bairro">Bairro</Label>
          <Input
            id="bairro"
            name="bairro"
            value={bairro}
            onChange={(e) => setBairro(e.target.value)}
            list="lista-bairros"
            required
          />
          <datalist id="lista-bairros">
            {bairros.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <ErroCampo erros={erros?.bairro} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="cidade">Cidade</Label>
            <Input
              id="cidade"
              name="cidade"
              value={cidade}
              onChange={(e) => {
                setCidade(e.target.value);
                setBairros([]);
              }}
              list="lista-cidades"
              required
            />
            <datalist id="lista-cidades">
              {cidades.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <ErroCampo erros={erros?.cidade} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="estado">UF</Label>
            <select
              id="estado"
              name="estado"
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value);
                setCidades([]);
              }}
              required
              className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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

      <fieldset className="space-y-1.5 border-0 p-0 m-0">
        <legend className="text-sm font-medium mb-1">Localização no mapa</legend>
        <div className="flex items-center gap-3">
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
            <p className="text-sm text-destructive" role="alert">
              {erroGeocode}
            </p>
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
        <p className="text-xs text-muted-foreground mt-2">
          Clique no mapa ou arraste o marcador para ajustar a posição exata.
        </p>

        <div className="grid grid-cols-2 gap-4 mt-3">
          <div className="space-y-1.5">
            <Label htmlFor="latitude">Latitude</Label>
            <Input
              id="latitude"
              name="latitude"
              type="number"
              step="0.000001"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              placeholder="-23.561684"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="longitude">Longitude</Label>
            <Input
              id="longitude"
              name="longitude"
              type="number"
              step="0.000001"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              placeholder="-46.655981"
            />
          </div>
        </div>
      </fieldset>
    </div>
  );
}
