// Limites do perfil público do profissional, compartilhados entre o
// schema de validação (servidor) e o formulário (cliente), pra os dois
// nunca divergirem sobre o que é aceito.
//
// 600 caracteres na apresentação: cabe uma apresentação real de duas ou
// três frases sem virar um texto que domina o card do imóvel — o imóvel
// continua sendo o produto da página.
export const LIMITE_BIO_PUBLICA = 600;

// Folgado o bastante pra qualquer formato estadual ("CRECI 00.000-F",
// "CRECI-SP 000000", número puro). A aplicação não valida a legislação
// do CRECI: só impede um campo desproporcional.
export const LIMITE_CRECI = 40;
