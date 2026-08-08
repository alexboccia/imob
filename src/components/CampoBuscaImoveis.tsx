"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Input } from "@/components/ui/input";

type Sugestao = {
  id: string;
  title: string;
  neighborhood: string;
  city: string;
  precoFormatado: string | null;
  fotoUrl: string | null;
};

// Campo de busca com autocomplete, compartilhado entre a Home
// (formulário GET nativo, precisa de `name`) e a barra de filtros de
// /imoveis (estado controlado + navegação via router.push, precisa de
// `onEnter`). Controlado por fora (value/onChange) pra permitir reset
// externo (ex: botão "Limpar filtros").
export function CampoBuscaImoveis({
  value,
  onChange,
  onEnter,
  name,
  placeholder = "Código, bairro ou empreendimento",
  className,
}: {
  value: string;
  onChange: (valor: string) => void;
  onEnter?: () => void;
  name?: string;
  placeholder?: string;
  className?: string;
}) {
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [abertas, setAbertas] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounce de 300ms pra não disparar uma requisição por tecla — a
  // busca em si é barata (contains sem índice, catálogo pequeno), o
  // debounce é só pra não afogar o servidor com digitação rápida.
  useEffect(() => {
    const termo = value.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (termo.length < 2) {
        setSugestoes([]);
        return;
      }
      try {
        const resp = await fetch(
          `/api/imoveis/sugestoes?busca=${encodeURIComponent(termo)}`,
          { signal: controller.signal }
        );
        if (!resp.ok) return;
        const dados = await resp.json();
        setSugestoes(dados.sugestoes ?? []);
        setAbertas(true);
      } catch {
        // AbortError de uma busca cancelada pela próxima tecla — ignora.
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setAbertas(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <Input
        type="text"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => sugestoes.length > 0 && setAbertas(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setAbertas(false);
            onEnter?.();
          }
          if (e.key === "Escape") setAbertas(false);
        }}
        placeholder={placeholder}
        className="w-full"
      />

      {abertas && sugestoes.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-background border rounded-lg shadow-lg max-h-80 overflow-y-auto z-10">
          {sugestoes.map((s) => (
            <Link
              key={s.id}
              href={`/imoveis/${s.id}`}
              onClick={() => setAbertas(false)}
              className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"
            >
              <div className="relative w-10 h-10 rounded shrink-0 bg-gray-100 overflow-hidden">
                {s.fotoUrl && (
                  <Image
                    src={s.fotoUrl}
                    alt={s.title}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{s.title}</p>
                <p className="text-xs text-gray-500 truncate">
                  {s.neighborhood}, {s.city}
                  {s.precoFormatado ? ` · ${s.precoFormatado}` : ""}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
