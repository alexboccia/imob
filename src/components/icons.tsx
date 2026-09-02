import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Menu,
  Check,
  MessageCircle,
  Phone,
  Mail,
  Share2,
  Heart,
  ZoomIn,
  ZoomOut,
  LayoutGrid,
  Play,
  Maximize2,
  BedDouble,
  BedSingle,
  Bath,
  Car,
  Search,
  SlidersHorizontal,
} from "lucide-react";

export function IconeChevronEsquerdo(props: { className?: string }) {
  return <ChevronLeft className={props.className} />;
}

export function IconeChevronDireito(props: { className?: string }) {
  return <ChevronRight className={props.className} />;
}

export function IconeChevronBaixo(props: { className?: string }) {
  return <ChevronDown className={props.className} />;
}

export function IconeFechar(props: { className?: string }) {
  return <X className={props.className} />;
}

export function IconeMenu(props: { className?: string }) {
  return <Menu className={props.className} />;
}

export function IconeCheck(props: { className?: string }) {
  return <Check className={props.className} />;
}

export function IconeMensagem(props: { className?: string }) {
  return <MessageCircle className={props.className} />;
}

// Logo oficial do WhatsApp — lucide não tem ícone de marca, então é um SVG
// próprio (glifo público, mesmo usado em qualquer botão "fale no
// WhatsApp") em vez de instalar uma lib só por causa de um ícone.
export function IconeWhatsApp(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.03c-.24.68-1.4 1.3-1.93 1.38-.49.08-1.1.11-1.78-.11-.41-.13-.93-.3-1.6-.59-2.83-1.22-4.68-4.06-4.82-4.25-.14-.19-1.15-1.53-1.15-2.92s.72-2.07.98-2.35c.24-.27.53-.34.71-.34.18 0 .36 0 .51.01.17.01.39-.06.6.47.24.6.83 2.06.9 2.21.07.15.11.32.02.51-.09.19-.14.31-.27.48-.14.17-.29.37-.41.5-.14.14-.28.29-.12.57.16.28.72 1.2 1.55 1.94 1.07.95 1.96 1.25 2.24 1.39.28.14.44.12.61-.07.17-.2.71-.83.9-1.11.19-.28.37-.23.62-.14.25.09 1.6.76 1.87.9.27.14.45.2.52.32.07.11.07.65-.17 1.32Z" />
    </svg>
  );
}

export function IconeTelefone(props: { className?: string }) {
  return <Phone className={props.className} />;
}

export function IconeEmail(props: { className?: string }) {
  return <Mail className={props.className} />;
}

export function IconeCompartilhar(props: { className?: string }) {
  return <Share2 className={props.className} />;
}

export function IconeCoracao(props: {
  className?: string;
  preenchido?: boolean;
}) {
  return (
    <Heart
      className={props.className}
      fill={props.preenchido ? "currentColor" : "none"}
    />
  );
}

export function IconeZoomMais(props: { className?: string }) {
  return <ZoomIn className={props.className} />;
}

export function IconeZoomMenos(props: { className?: string }) {
  return <ZoomOut className={props.className} />;
}

export function IconeGrade(props: { className?: string }) {
  return <LayoutGrid className={props.className} />;
}

export function IconePlay(props: { className?: string }) {
  return <Play className={props.className} fill="currentColor" />;
}

export function IconeArea(props: { className?: string }) {
  return <Maximize2 className={props.className} />;
}

export function IconeQuartos(props: { className?: string }) {
  return <BedDouble className={props.className} />;
}

export function IconeSuite(props: { className?: string }) {
  return <BedSingle className={props.className} />;
}

export function IconeBanheiro(props: { className?: string }) {
  return <Bath className={props.className} />;
}

export function IconeVaga(props: { className?: string }) {
  return <Car className={props.className} />;
}

export function IconeBusca(props: { className?: string }) {
  return <Search className={props.className} />;
}

export function IconeFiltros(props: { className?: string }) {
  return <SlidersHorizontal className={props.className} />;
}
