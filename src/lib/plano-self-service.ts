// =======================================================================
// Plano do cadastro self-service (Fase 26/27)
// =======================================================================
// Uma única fonte de verdade para "qual plano uma imobiliária recebe ao
// se cadastrar sozinha". Resolvido por CÓDIGO no servidor e jamais
// aceito do browser: aceitar planId de formulário deixaria qualquer
// pessoa criar organização no plano mais caro, de graça.
//
// Módulo próprio, e não uma constante solta dentro da action, por dois
// motivos: a decisão é de domínio (não de tela), e isolá-la permite que
// testes de integração substituam o código do plano — necessário porque
// a linha de catálogo `Plan(code: "STARTER")` é GLOBAL e já pertence à
// suíte que testa o script de bootstrap do P.9. O contrato de isolamento
// desta suíte é por organização, não por catálogo; depender de uma linha
// global compartilhada foi o que fez os dois arquivos brigarem.
export const CODIGO_PLANO_SELF_SERVICE = "STARTER";
