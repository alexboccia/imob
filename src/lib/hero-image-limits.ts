// Constantes puras (sem sharp, sem I/O) sobre a imagem do Hero da Home —
// seguro de importar tanto do client (HeroImageUpload.tsx, pro texto de
// ajuda) quanto do servidor (hero-image-processar.ts, pra validação de
// verdade). A validação real acontece só no servidor; estes números aqui
// no client são só orientação, nunca a fonte de verdade.

// Abaixo disso a imagem fica visivelmente esticada/borrada no Hero
// (fundo full-bleed, até a largura inteira da viewport em desktop) —
// ver HeroImageUpload.tsx pro texto de ajuda que usa estes valores.
export const HERO_LARGURA_MINIMA = 1600;
export const HERO_ALTURA_MINIMA = 700;

// Nenhuma tela real precisa de mais que isto de largura — arquivo maior
// só desperdiça armazenamento/egress sem ganho visual (o Hero já é
// cover, recortado; o resize final ainda preserva a proporção original).
export const HERO_LARGURA_MAXIMA_ARMAZENADA = 2560;
