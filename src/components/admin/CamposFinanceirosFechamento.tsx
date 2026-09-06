"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CampoMoeda } from "@/components/admin/CampoMoeda";
import { formatarPreco } from "@/lib/format";
import { calcularComissaoPorPercentual } from "@/lib/comissao";

const CLASSE_CAMPO =
  "h-9 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

// Campos financeiros do fechamento (Fase 10) — valor negociado e comissão.
// Compartilhado pelo diálogo de "Marcar como ganho" e pelo de correção,
// para que as duas telas peçam exatamente os mesmos dados com as mesmas
// palavras.
//
// O ATALHO DE PERCENTUAL não é persistido: ele só CALCULA um valor em
// reais e preenche o campo de comissão, que continua editável. O que vai
// para o banco é sempre o valor confirmado — guardar o percentual junto
// criaria duas fontes de verdade que divergiriam na primeira correção.
// Por isso ele também não tem `name`: nunca entra no FormData.
//
// A comissão é OPCIONAL: em branco significa "ainda não registrada", e o
// negócio é gravado como ganho do mesmo jeito.
export function CamposFinanceirosFechamento({
  idPrefixo,
  valorInicial,
  comissaoInicial,
}: {
  idPrefixo: string;
  valorInicial?: number | null;
  comissaoInicial?: number | null;
}) {
  // Dígitos em centavos, mesma representação interna do CampoMoeda — é o
  // que permite ao atalho de percentual preencher o campo sem os bugs de
  // arredondamento de máscara digitada da direita para a esquerda.
  const paraDigitos = (valor?: number | null) =>
    valor == null ? "" : String(Math.round(valor * 100));

  const [digitosValor, setDigitosValor] = useState(() => paraDigitos(valorInicial));
  const [digitosComissao, setDigitosComissao] = useState(() => paraDigitos(comissaoInicial));
  const [percentual, setPercentual] = useState("");

  const valorFechado = digitosValor ? Number(digitosValor) / 100 : null;
  const comissaoCalculada = calcularComissaoPorPercentual(valorFechado, percentual);

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefixo}-valor`}>Valor de fechamento</Label>
        <CampoMoeda
          id={`${idPrefixo}-valor`}
          name="valorFechamento"
          className={CLASSE_CAMPO}
          digitos={digitosValor}
          onDigitosChange={setDigitosValor}
        />
        <p className="text-xs text-muted-foreground">
          Valor negociado do imóvel. Não é comissão nem receita da imobiliária.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefixo}-comissao`}>Comissão do negócio (opcional)</Label>
        <CampoMoeda
          id={`${idPrefixo}-comissao`}
          name="valorComissao"
          className={CLASSE_CAMPO}
          digitos={digitosComissao}
          onDigitosChange={setDigitosComissao}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={`${idPrefixo}-percentual`} className="text-xs font-normal text-muted-foreground">
            Calcular por %
          </Label>
          <Input
            id={`${idPrefixo}-percentual`}
            inputMode="decimal"
            value={percentual}
            onChange={(e) => setPercentual(e.target.value)}
            placeholder="5"
            className="h-8 w-20"
          />
          <button
            type="button"
            disabled={comissaoCalculada === null}
            onClick={() => {
              if (comissaoCalculada === null) return;
              setDigitosComissao(String(Math.round(comissaoCalculada * 100)));
            }}
            className="h-8 rounded-lg border border-input px-3 text-sm font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Aplicar
          </button>
          {/* O valor calculado aparece ANTES de ser aplicado: o corretor
              vê exatamente que número será registrado. */}
          {comissaoCalculada !== null && (
            <span className="text-xs text-muted-foreground">= {formatarPreco(comissaoCalculada)}</span>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Deixe em branco se a comissão ainda não estiver definida. O sistema não calcula comissão
          sozinho — não há percentual configurado.
        </p>
      </div>
    </>
  );
}
