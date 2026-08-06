"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { formatarTelefone } from "@/lib/telefone";

export function CampoTelefone({
  id,
  name,
  defaultValue,
  placeholder = "(11) 99999-9999",
  required,
  className,
}: {
  id?: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const [valor, setValor] = useState(() => formatarTelefone(defaultValue ?? ""));

  return (
    <Input
      id={id}
      name={name}
      type="tel"
      inputMode="tel"
      value={valor}
      onChange={(e) => setValor(formatarTelefone(e.target.value))}
      placeholder={placeholder}
      required={required}
      className={className}
    />
  );
}
