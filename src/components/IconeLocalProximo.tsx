import {
  Bus,
  Croissant,
  Dumbbell,
  GraduationCap,
  MapPin,
  PawPrint,
  Pill,
  School,
  ShoppingBag,
  ShoppingCart,
  Stethoscope,
  TrainFront,
  Trees,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { CategoriaLocal } from "@/lib/locais-proximos";

// O ícone vem da categoria, nunca de escolha do corretor: o mesmo mapa
// serve o formulário e a ficha pública, então os dois nunca divergem.
const ICONE_POR_CATEGORIA: Record<CategoriaLocal, LucideIcon> = {
  MARKET: ShoppingCart,
  BAKERY: Croissant,
  PHARMACY: Pill,
  HEALTH: Stethoscope,
  SCHOOL: School,
  UNIVERSITY: GraduationCap,
  SUBWAY: TrainFront,
  TRANSPORT: Bus,
  PARK: Trees,
  SHOPPING: ShoppingBag,
  GYM: Dumbbell,
  RESTAURANT: UtensilsCrossed,
  PET_SHOP: PawPrint,
  OTHER: MapPin,
};

/** Decorativo: o nome da categoria sempre aparece em texto ao lado. */
export function IconeLocalProximo({
  categoria,
  className,
}: {
  categoria: CategoriaLocal;
  className?: string;
}) {
  const Icone = ICONE_POR_CATEGORIA[categoria] ?? MapPin;
  return <Icone aria-hidden="true" focusable="false" className={className} />;
}
