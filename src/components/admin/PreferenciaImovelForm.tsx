"use client";

import { useActionState, useState } from "react";
import type { PropertyPurpose } from "@/generated/prisma/client";
import { salvarPreferenciaPessoa } from "@/app/app/clientes/actions";
import { ESTADO_INICIAL_ACAO } from "@/lib/action-result";
import { SeletorCaracteristicas } from "@/components/admin/SeletorCaracteristicas";
import { SeletorTags } from "@/components/admin/SeletorTags";
import { CampoMoeda } from "@/components/admin/CampoMoeda";
import { ErroCampo } from "@/components/admin/ErroCampo";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PreferenciaValores = {
  // PropertyPurpose (não só "SALE"|"RENT") porque é o tipo real da coluna
  // no banco — SALE_AND_RENT nunca é gravado por esta action (a
  // validação Zod só aceita SALE/RENT), mas o campo do banco continua
  // sendo o enum completo. defaultValue do <Select> abaixo só reconhece
  // "SALE"/"RENT" como opção; qualquer outro valor fica sem seleção.
  transactionType: PropertyPurpose | null;
  propertyTypes: string[];
  cities: string[];
  neighborhoods: string[];
  minPrice: string | null;
  maxPrice: string | null;
  minBedrooms: number | null;
  minBathrooms: number | null;
  minParkingSpots: number | null;
  minArea: number | null;
  maxArea: number | null;
  desiredPropertyFeatures: string[];
  desiredCondoFeatures: string[];
  notes: string | null;
};

export function PreferenciaImovelForm({
  pessoaId,
  existe,
  valoresIniciais,
  opcoesTiposResidencial,
  opcoesTiposComercial,
  opcoesCaracteristicasImovel,
  opcoesCaracteristicasCondominio,
  sugestoesCidades,
  sugestoesBairros,
}: {
  pessoaId: string;
  existe: boolean;
  valoresIniciais?: PreferenciaValores;
  opcoesTiposResidencial: string[];
  opcoesTiposComercial: string[];
  opcoesCaracteristicasImovel: string[];
  opcoesCaracteristicasCondominio: string[];
  sugestoesCidades: string[];
  sugestoesBairros: string[];
}) {
  const [mostrarFormulario, setMostrarFormulario] = useState(existe);
  const acao = salvarPreferenciaPessoa.bind(null, pessoaId);
  const [estado, formAction, pendente] = useActionState(acao, ESTADO_INICIAL_ACAO);
  const v = valoresIniciais;

  if (!mostrarFormulario) {
    return (
      <div>
        <p className="text-sm text-muted-foreground mb-3">
          Nenhuma preferência de imóvel cadastrada.
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => setMostrarFormulario(true)}
        >
          Adicionar preferências
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      {estado.message && !estado.success && (
        <Alert variant="destructive">
          <AlertDescription>{estado.message}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5 max-w-xs">
        <Label htmlFor="transactionType">Finalidade</Label>
        <Select name="transactionType" defaultValue={v?.transactionType ?? ""}>
          <SelectTrigger id="transactionType" className="w-full">
            <SelectValue placeholder="Qualquer" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="SALE">Comprar</SelectItem>
            <SelectItem value="RENT">Alugar</SelectItem>
          </SelectContent>
        </Select>
        <ErroCampo erros={estado.fieldErrors?.transactionType} />
      </div>

      <div>
        <SeletorCaracteristicas
          nome="propertyTypes"
          titulo="Tipo de imóvel"
          opcoes={[...opcoesTiposResidencial, ...opcoesTiposComercial]}
          selecionadas={v?.propertyTypes ?? []}
        />
        <ErroCampo erros={estado.fieldErrors?.propertyTypes} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <SeletorTags
            nome="cities"
            titulo="Cidades"
            sugestoes={sugestoesCidades}
            valoresIniciais={v?.cities ?? []}
            placeholder="Ex: São Paulo"
          />
          <ErroCampo erros={estado.fieldErrors?.cities} />
        </div>
        <div>
          <SeletorTags
            nome="neighborhoods"
            titulo="Bairros"
            sugestoes={sugestoesBairros}
            valoresIniciais={v?.neighborhoods ?? []}
            placeholder="Ex: Vila Mariana"
          />
          <ErroCampo erros={estado.fieldErrors?.neighborhoods} />
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Faixa de preço (R$)</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="minPrice" className="text-xs text-muted-foreground">
              Mínimo
            </Label>
            <CampoMoeda
              id="minPrice"
              name="minPrice"
              defaultValue={v?.minPrice ?? null}
              className="w-full border rounded-md px-3 py-2"
            />
            <ErroCampo erros={estado.fieldErrors?.minPrice} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxPrice" className="text-xs text-muted-foreground">
              Máximo
            </Label>
            <CampoMoeda
              id="maxPrice"
              name="maxPrice"
              defaultValue={v?.maxPrice ?? null}
              className="w-full border rounded-md px-3 py-2"
            />
            <ErroCampo erros={estado.fieldErrors?.maxPrice} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="minBedrooms">Quartos (mínimo)</Label>
          <Input
            id="minBedrooms"
            name="minBedrooms"
            type="number"
            min={0}
            defaultValue={v?.minBedrooms ?? ""}
          />
          <ErroCampo erros={estado.fieldErrors?.minBedrooms} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="minBathrooms">Banheiros (mínimo)</Label>
          <Input
            id="minBathrooms"
            name="minBathrooms"
            type="number"
            min={0}
            defaultValue={v?.minBathrooms ?? ""}
          />
          <ErroCampo erros={estado.fieldErrors?.minBathrooms} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="minParkingSpots">Vagas (mínimo)</Label>
          <Input
            id="minParkingSpots"
            name="minParkingSpots"
            type="number"
            min={0}
            defaultValue={v?.minParkingSpots ?? ""}
          />
          <ErroCampo erros={estado.fieldErrors?.minParkingSpots} />
        </div>
      </div>

      <div>
        <p className="text-sm font-medium mb-2">Área privativa (m²)</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="minArea" className="text-xs text-muted-foreground">
              Mínima
            </Label>
            <Input
              id="minArea"
              name="minArea"
              type="number"
              step="0.01"
              min={0}
              defaultValue={v?.minArea ?? ""}
            />
            <ErroCampo erros={estado.fieldErrors?.minArea} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="maxArea" className="text-xs text-muted-foreground">
              Máxima
            </Label>
            <Input
              id="maxArea"
              name="maxArea"
              type="number"
              step="0.01"
              min={0}
              defaultValue={v?.maxArea ?? ""}
            />
            <ErroCampo erros={estado.fieldErrors?.maxArea} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div>
          <SeletorCaracteristicas
            nome="desiredPropertyFeatures"
            titulo="Características desejadas do imóvel"
            opcoes={opcoesCaracteristicasImovel}
            selecionadas={v?.desiredPropertyFeatures ?? []}
          />
          <ErroCampo erros={estado.fieldErrors?.desiredPropertyFeatures} />
        </div>
        <div>
          <SeletorCaracteristicas
            nome="desiredCondoFeatures"
            titulo="Características desejadas do condomínio"
            opcoes={opcoesCaracteristicasCondominio}
            selecionadas={v?.desiredCondoFeatures ?? []}
          />
          <ErroCampo erros={estado.fieldErrors?.desiredCondoFeatures} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Observações</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={v?.notes ?? ""}
          placeholder="Ex: Prefere andar alto e condomínio com lazer."
        />
        <ErroCampo erros={estado.fieldErrors?.notes} />
      </div>

      <Button type="submit" disabled={pendente}>
        {pendente ? "Salvando..." : "Salvar preferências"}
      </Button>
    </form>
  );
}
