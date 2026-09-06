import { Label } from "@/components/ui/label";
import { SEM_RESPONSAVEL_LABEL, type OpcaoResponsavel } from "@/lib/responsavel-negociacao";

// Seletor de responsável pela negociação (Fase 11), compartilhado pelo
// formulário de relacionar imóvel e pelo diálogo de transferência — para
// que as duas telas ofereçam exatamente as mesmas opções com as mesmas
// palavras.
//
// <select> NATIVO de propósito, e não o Select do Base UI usado logo ao
// lado para o imóvel: teclado, foco, leitura por leitor de tela e
// rolagem em telas pequenas vêm prontos do navegador, sem camada de
// portal/overlay. É também o mesmo elemento já usado nos filtros do
// Pipeline, então a barra e o diálogo se comportam igual.
//
// A lista recebida contém apenas membros ATIVOS (ver
// buscarMembrosAtribuiveis): membro inativo continua sendo responsável
// HISTÓRICO de negociações antigas, mas não recebe atribuição nova.
export function SeletorResponsavel({
  id,
  membros,
  valorInicial,
  // Texto da opção vazia. Muda entre criar ("deixar sem responsável") e
  // transferir ("remover o responsável atual"), e por isso não é fixo.
  rotuloVazio = SEM_RESPONSAVEL_LABEL,
  label = "Responsável pela negociação",
  descricao,
}: {
  id: string;
  membros: OpcaoResponsavel[];
  valorInicial?: string | null;
  rotuloVazio?: string;
  label?: string;
  descricao?: string;
}) {
  // O responsável histórico pode não estar na lista de atribuíveis (foi
  // desativado depois de assumir a negociação). Sem esta opção extra, o
  // <select> cairia silenciosamente na primeira opção e a submissão
  // TROCARIA o responsável sem ninguém pedir — o navegador não tem como
  // exibir um defaultValue que não existe entre as options.
  const inicial = valorInicial ?? "";
  const precisaOpcaoHistorica = inicial !== "" && !membros.some((m) => m.memberId === inicial);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        name="responsavelId"
        defaultValue={inicial}
        className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="">{rotuloVazio}</option>
        {precisaOpcaoHistorica && (
          <option value={inicial}>Responsável atual (inativo)</option>
        )}
        {membros.map((membro) => (
          <option key={membro.memberId} value={membro.memberId}>
            {membro.nome}
          </option>
        ))}
      </select>
      {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
    </div>
  );
}
