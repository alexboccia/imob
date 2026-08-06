"use client";

import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FaixaDupla({
  titulo,
  min,
  max,
  step,
  valorMin,
  valorMax,
  onChangeMin,
  onChangeMax,
  labelMin,
  labelMax,
}: {
  titulo: string;
  min: number;
  max: number;
  step: number;
  valorMin: string;
  valorMax: string;
  onChangeMin: (valor: string) => void;
  onChangeMax: (valor: string) => void;
  labelMin: string;
  labelMax: string;
}) {
  const atual: [number, number] = [
    Math.min(Math.max(valorMin ? Number(valorMin) : min, min), max),
    Math.min(Math.max(valorMax ? Number(valorMax) : max, min), max),
  ];

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">
        {titulo}
      </p>
      <Slider
        min={min}
        max={max}
        step={step}
        value={atual}
        onValueChange={(valores) => {
          const [novoMin, novoMax] = valores as number[];
          onChangeMin(novoMin > min ? String(novoMin) : "");
          onChangeMax(novoMax < max ? String(novoMax) : "");
        }}
      />
      <div className="flex items-center justify-between text-xs text-gray-500 mt-2">
        <span>Sem mínimo</span>
        <span>Sem máximo</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="space-y-1">
          <Label className="text-xs">{labelMin}</Label>
          <Input
            type="number"
            value={valorMin}
            onChange={(e) => onChangeMin(e.target.value)}
            placeholder="Sem mínimo"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{labelMax}</Label>
          <Input
            type="number"
            value={valorMax}
            onChange={(e) => onChangeMax(e.target.value)}
            placeholder="Sem máximo"
          />
        </div>
      </div>
    </div>
  );
}
