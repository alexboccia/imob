"use client";

import { useState } from "react";
import { paraDigitosMoeda, formatarExibicaoMoeda } from "@/lib/format";

// Campo de moeda mascarado. O estado interno é a string de DÍGITOS em
// centavos (nunca um float), o que evita os bugs clássicos de
// arredondamento de máscara digitada da direita para a esquerda.
//
// Modo CONTROLADO (Fase 10): quando `digitos` e `onDigitosChange` são
// passados, quem controla é o pai. Isso existe porque o atalho de "%" do
// fechamento precisa PREENCHER o campo de comissão a partir do valor
// negociado — algo impossível com o estado trancado aqui dentro.
// Sem essas props o componente segue exatamente como antes,
// não-controlado, e nenhum call site existente muda de comportamento.
export function CampoMoeda({
  id,
  name,
  defaultValue,
  placeholder = "0,00",
  className,
  digitos: digitosControlados,
  onDigitosChange,
}: {
  id?: string;
  name: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  className?: string;
  digitos?: string;
  onDigitosChange?: (digitos: string) => void;
}) {
  const [digitosInternos, setDigitosInternos] = useState(() => paraDigitosMoeda(defaultValue));

  const controlado = digitosControlados !== undefined && onDigitosChange !== undefined;
  const digitos = controlado ? digitosControlados : digitosInternos;
  const definirDigitos = controlado ? onDigitosChange : setDigitosInternos;

  const valorNumerico = digitos ? Number(digitos) / 100 : null;

  return (
    <>
      <input
        type="hidden"
        name={name}
        value={valorNumerico !== null ? valorNumerico.toFixed(2) : ""}
      />
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={formatarExibicaoMoeda(digitos)}
        onChange={(e) => {
          definirDigitos(e.target.value.replace(/\D/g, "").slice(0, 12));
        }}
        placeholder={placeholder}
        className={className}
      />
    </>
  );
}
