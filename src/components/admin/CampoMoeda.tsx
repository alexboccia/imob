"use client";

import { useState } from "react";
import { paraDigitosMoeda, formatarExibicaoMoeda } from "@/lib/format";

export function CampoMoeda({
  id,
  name,
  defaultValue,
  placeholder = "0,00",
  className,
}: {
  id?: string;
  name: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  className?: string;
}) {
  const [digitos, setDigitos] = useState(() => paraDigitosMoeda(defaultValue));
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
          setDigitos(e.target.value.replace(/\D/g, "").slice(0, 12));
        }}
        placeholder={placeholder}
        className={className}
      />
    </>
  );
}
