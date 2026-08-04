import {
  Waves,
  Dumbbell,
  PartyPopper,
  Baby,
  Blocks,
  Gamepad2,
  Cctv,
  ShieldCheck,
  ArrowUpDown,
  Bike,
  Volleyball,
  Footprints,
  UtensilsCrossed,
  Briefcase,
  Video,
  Tv,
  Sparkles,
  Zap,
  Sun,
  WashingMachine,
  PawPrint,
  Car,
  Wifi,
  Wind,
  Trees,
  DoorOpen,
  Layers,
  Mountain,
  Sunrise,
  Sunset,
  Sofa,
  Flame,
  Warehouse,
  Accessibility,
  type LucideIcon,
} from "lucide-react";
import { IconeCheck } from "@/components/icons";
import { normalizarTexto } from "@/lib/texto";

// Mapeia palavras-chave (sem acento) do catálogo de características para um
// ícone mais descritivo. Itens que não batem com nenhuma regra continuam
// exibindo o check verde padrão.
const REGRAS: { termos: string[]; Icone: LucideIcon }[] = [
  { termos: ["piscina", "hidromassagem", "jacuzzi"], Icone: Waves },
  { termos: ["academia"], Icone: Dumbbell },
  { termos: ["salao de festas"], Icone: PartyPopper },
  { termos: ["playground", "bercario", "fraldario"], Icone: Baby },
  { termos: ["brinquedoteca", "espaco kids"], Icone: Blocks },
  { termos: ["espaco teen", "sala de jogos"], Icone: Gamepad2 },
  { termos: ["cftv", "cameras de seguranca"], Icone: Cctv },
  {
    termos: [
      "portaria",
      "seguranca",
      "controle de acesso",
      "ronda",
      "cerca eletrica",
      "portao eletronico",
    ],
    Icone: ShieldCheck,
  },
  { termos: ["elevador"], Icone: ArrowUpDown },
  { termos: ["bicicletario"], Icone: Bike },
  { termos: ["quadra", "campo de futebol", "beach tennis", "tenis"], Icone: Volleyball },
  { termos: ["pista de caminhada", "pista de cooper"], Icone: Footprints },
  { termos: ["espaco gourmet"], Icone: UtensilsCrossed },
  { termos: ["coworking", "escritorio", "home office"], Icone: Briefcase },
  { termos: ["sala de cinema"], Icone: Video },
  { termos: ["sala de tv"], Icone: Tv },
  { termos: ["spa"], Icone: Sparkles },
  { termos: ["gerador", "carregador para"], Icone: Zap },
  { termos: ["energia solar", "aquecimento solar"], Icone: Sun },
  { termos: ["lavanderia"], Icone: WashingMachine },
  { termos: ["pet"], Icone: PawPrint },
  { termos: ["estacionamento", "vaga", "garagem", "car wash"], Icone: Car },
  { termos: ["wifi", "internet", "cabeamento estruturado"], Icone: Wifi },
  { termos: ["ar-condicionado", "climatizacao"], Icone: Wind },
  { termos: ["jardim", "quintal"], Icone: Trees },
  { termos: ["sacada", "varanda", "terraco"], Icone: DoorOpen },
  { termos: ["piso "], Icone: Layers },
  { termos: ["vista "], Icone: Mountain },
  { termos: ["sol da manha"], Icone: Sunrise },
  { termos: ["sol da tarde"], Icone: Sunset },
  { termos: ["mobiliado"], Icone: Sofa },
  { termos: ["churrasqueira", "lareira", "sauna"], Icone: Flame },
  { termos: ["deposito"], Icone: Warehouse },
  { termos: ["acessivel", "pcd"], Icone: Accessibility },
];

export function IconeCaracteristica({
  nome,
  className,
}: {
  nome: string;
  className?: string;
}) {
  const normalizado = normalizarTexto(nome);
  const regra = REGRAS.find((r) =>
    r.termos.some((termo) => normalizado.includes(termo))
  );
  const Icone = regra?.Icone ?? IconeCheck;
  return <Icone className={className} />;
}
