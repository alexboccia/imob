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
