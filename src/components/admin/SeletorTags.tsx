"use client";

import { useId, useState } from "react";

// Multi-valor de texto livre com sugestões (datalist nativo, mesmo padrão
// já usado em CamposEndereco.tsx pros campos bairro/cidade do imóvel) —
// diferente de SeletorCaracteristicas, que é restrito a um catálogo
// fixo. Usado onde o vocabulário é livre (cidades/bairros de
// PersonPreference), nunca pra campos com catálogo por organização
// (esses reaproveitam SeletorCaracteristicas).
export function SeletorTags({
  nome,
  titulo,
  sugestoes = [],
  valoresIniciais = [],
  placeholder = "Digite e pressione Enter",
}: {
  nome: string;
  titulo: string;
  sugestoes?: string[];
  valoresIniciais?: string[];
  placeholder?: string;
}) {
  const [valores, setValores] = useState<string[]>(valoresIniciais);
  const [texto, setTexto] = useState("");
  const inputId = useId();
  const listId = useId();

  function adicionar(valor: string) {
    const limpo = valor.trim();
    // Comparação sem diferenciar maiúsculas/minúsculas — "Moema" e
    // "moema" são a mesma tag pro usuário, mesmo critério aplicado no
    // servidor (person-preference-schema.ts). Mantém a apresentação já
    // digitada, só a comparação é normalizada.
    const jaExiste = valores.some((v) => v.toLowerCase() === limpo.toLowerCase());
    if (!limpo || jaExiste) {
      setTexto("");
      return;
    }
    setValores((atuais) => [...atuais, limpo]);
    setTexto("");
  }

  function remover(valor: string) {
    setValores((atuais) => atuais.filter((v) => v !== valor));
  }

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium mb-2">
        {titulo}
      </label>
      {valores.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {valores.map((valor) => (
            <span
              key={valor}
              className="inline-flex items-center gap-1.5 text-sm pl-3 pr-2 py-1.5 rounded-full border border-gray-300 bg-gray-50"
            >
              {valor}
              <input type="hidden" name={nome} value={valor} />
              <button
                type="button"
                onClick={() => remover(valor)}
                aria-label={`Remover ${valor}`}
                className="text-gray-500 hover:text-gray-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={inputId}
        type="text"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            adicionar(texto);
          }
        }}
        onBlur={() => adicionar(texto)}
        list={listId}
        placeholder={placeholder}
        className="w-full border rounded-md px-3 py-2 text-sm"
      />
      <datalist id={listId}>
        {sugestoes
          .filter((sugestao) => !valores.includes(sugestao))
          .map((sugestao) => (
            <option key={sugestao} value={sugestao} />
          ))}
      </datalist>
    </div>
  );
}
