"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ESTAGIO_OBRA_LABEL } from "@/lib/format";

// Cadastro de lançamento. Antes desta seção existir, o checkbox
// "Lançamento" ficava num grupo genérico de rótulos (ao lado de Destaque
// e Oportunidade) e os três campos que só fazem sentido num lançamento —
// construtora, estágio da obra e previsão de entrega — apareciam soltos
// 240px abaixo, sempre visíveis, sem nada indicando que pertenciam um ao
// outro. Quem marcava "Lançamento" não recebia nenhum sinal de que havia
// mais o que preencher, e quem cadastrava um imóvel pronto via três
// campos irrelevantes. É a explicação mais provável para um lançamento
// real em produção ter o rótulo e nenhum dado de obra.
//
// PRESERVAÇÃO DE DADOS: os inputs NUNCA saem do DOM. Desmarcar
// "Lançamento" só recolhe a seção — os campos continuam montados e
// continuam sendo enviados no FormData, então nada é apagado por
// esconder. Se já houver dado preenchido, a seção nem recolhe: some
// silenciosamente com informação salva seria pior que mostrar demais.

const ORDEM_ESTAGIOS = [
  "PRE_CONSTRUCTION",
  "UNDER_CONSTRUCTION",
  "READY_TO_MOVE",
] as const;

// O que cada estágio significa. O enum tem exatamente três valores e
// nenhum percentual — estes textos explicam as opções sem inventar
// precisão que o domínio não tem.
const AJUDA_ESTAGIO: Record<string, string> = {
  PRE_CONSTRUCTION: "Ainda não iniciada",
  UNDER_CONSTRUCTION: "Obras em andamento",
  READY_TO_MOVE: "Concluída, pronta para morar",
};

function mesAnoParaInput(data: Date | null | undefined): string {
  if (!data) return "";
  // getUTC*: o valor é gravado como UTC meia-noite do dia 1 (ver
  // parseMesAno em property-mapper.ts). Ler em horário local deslocaria
  // o mês para trás em fusos negativos — junho viraria maio.
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function SecaoLancamentoFields({
  valores,
}: {
  valores: {
    lancamento?: boolean;
    construtora?: string | null;
    estagioObra?: string | null;
    previsaoEntrega?: Date | null;
  };
}) {
  const [ehLancamento, setEhLancamento] = useState(valores.lancamento ?? false);
  const [construtora, setConstrutora] = useState(valores.construtora ?? "");
  const [estagio, setEstagio] = useState(valores.estagioObra ?? "");
  const [entrega, setEntrega] = useState(mesAnoParaInput(valores.previsaoEntrega));

  const preenchidos = [construtora.trim(), estagio, entrega].filter(Boolean).length;
  const temAlgumDado = preenchidos > 0;
  // Recolhe só quando não é lançamento E não há nada preenchido: dado
  // salvo nunca fica escondido de quem está editando.
  const aberta = ehLancamento || temAlgumDado;

  return (
    <fieldset className="space-y-4 rounded-lg border p-4">
      <legend className="px-1 text-sm font-semibold">Lançamento</legend>

      <div className="space-y-0.5">
        <label className="flex items-start gap-2.5 text-sm font-medium">
          <Checkbox
            name="lancamento"
            checked={ehLancamento}
            onCheckedChange={(marcado) => setEhLancamento(marcado === true)}
            className="mt-0.5"
          />
          Este imóvel é um lançamento
        </label>
        <p className="pl-6 text-xs text-muted-foreground">
          Aparece com o selo &quot;Lançamento&quot; no site e entra no filtro
          Lançamentos do menu.
        </p>
      </div>

      {aberta && (
        <div className="space-y-4 border-t pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm font-medium">Informações da obra</p>
            {/* Completude derivada em runtime, sem nada persistido: só
                conta quantos dos três campos estão preenchidos. Serve
                para tornar visível o que a página pública vai poder
                mostrar — não é meta nem bloqueio. */}
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {preenchidos} de 3 informações preenchidas
            </p>
          </div>

          {ehLancamento && preenchidos === 0 && (
            <p
              id="ajuda-lancamento"
              className="rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground"
            >
              Estes campos são opcionais, mas são eles que enriquecem a página
              pública do lançamento: sem nenhum deles, o anúncio mostra apenas
              o selo.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="construtora">Construtora / incorporadora</Label>
            <Input
              id="construtora"
              name="construtora"
              value={construtora}
              onChange={(e) => setConstrutora(e.target.value)}
              placeholder="Ex: Cyrela"
              aria-describedby={
                ehLancamento && preenchidos === 0 ? "ajuda-lancamento" : undefined
              }
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="estagioObra">Estágio da obra</Label>
              <Select
                name="estagioObra"
                value={estagio}
                onValueChange={(valor) => setEstagio(String(valor ?? ""))}
              >
                <SelectTrigger id="estagioObra" className="w-full">
                  <SelectValue>
                    {(valor: string) =>
                      valor ? (ESTAGIO_OBRA_LABEL[valor] ?? valor) : "Não se aplica"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Não se aplica</SelectItem>
                  {ORDEM_ESTAGIOS.map((valor) => (
                    <SelectItem key={valor} value={valor}>
                      {ESTAGIO_OBRA_LABEL[valor]}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {AJUDA_ESTAGIO[valor]}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Monta a linha do tempo da obra na página do imóvel.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="previsaoEntrega">Previsão de entrega</Label>
              <Input
                id="previsaoEntrega"
                name="previsaoEntrega"
                type="month"
                value={entrega}
                onChange={(e) => setEntrega(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Apenas mês e ano. Usada enquanto a obra não está concluída.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Fora do modo aberto os campos continuam montados e enviados —
          é isto que garante que desmarcar "Lançamento" não apague o que
          já estava salvo. */}
      {!aberta && (
        <>
          <input type="hidden" name="construtora" value={construtora} />
          <input type="hidden" name="estagioObra" value={estagio} />
          <input type="hidden" name="previsaoEntrega" value={entrega} />
        </>
      )}
    </fieldset>
  );
}
