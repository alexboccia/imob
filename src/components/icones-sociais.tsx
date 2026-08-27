// Ícones de redes sociais usados só no footer público — lucide-react
// nesta versão do projeto não inclui marcas (Instagram/Facebook/YouTube/
// LinkedIn foram removidos das versões recentes do pacote por questão de
// marca registrada) e não há nenhuma outra lib de ícones de marca
// instalada. Glifos genéricos simples (câmera/"f"/play/"in"), não uma
// cópia do logotipo oficial de cada rede — suficiente pra reconhecimento
// visual num footer, sem redistribuir um asset de marca de terceiros.
type IconeProps = { className?: string };

export function IconeInstagram({ className }: IconeProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconeFacebook({ className }: IconeProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M13.5 21v-8h2.7l.4-3.2h-3.1V7.7c0-.9.3-1.6 1.6-1.6h1.7V3.2C16.5 3.1 15.4 3 14.2 3 11.7 3 10 4.5 10 7.3v2.5H7.3v3.2H10V21h3.5Z" />
    </svg>
  );
}

export function IconeYoutube({ className }: IconeProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10.5 9.5v5l4.5-2.5-4.5-2.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconeLinkedin({ className }: IconeProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="3" fillOpacity="0" stroke="currentColor" strokeWidth={2} />
      <circle cx="7.5" cy="8" r="1.4" />
      <path d="M6.3 10.7h2.4V18H6.3v-7.3Zm4.2 0h2.3v1c.5-.7 1.3-1.2 2.4-1.2 1.8 0 3 1.2 3 3.5V18h-2.4v-3.6c0-1-.4-1.7-1.3-1.7-.7 0-1.2.5-1.4 1-.1.2-.1.5-.1.8V18h-2.4v-7.3Z" />
    </svg>
  );
}
