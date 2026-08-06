"use client";

import { useState } from "react";

function paraDigitos(valor: string | number | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const numero = Number(valor);
  if (Number.isNaN(numero)) return "";
  return String(Math.round(numero * 100));
}

function formatarExibicao(digitos: string): string {
  if (!digitos) return "";
  const numero = Number(digitos) / 100;
  return numero.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

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
  const [digitos, setDigitos] = useState(() => paraDigitos(defaultValue));
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
        value={formatarExibicao(digitos)}
        onChange={(e) => {
          setDigitos(e.target.value.replace(/\D/g, "").slice(0, 12));
        }}
        placeholder={placeholder}
        className={className}
      />
    </>
  );
}
