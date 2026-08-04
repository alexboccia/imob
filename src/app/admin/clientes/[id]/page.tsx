import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  atualizarEstagioFunil,
  registrarInteracao,
} from "@/app/admin/clientes/actions";

const ESTAGIOS = [
  "NOVO_LEAD",
  "CONTATO_FEITO",
  "VISITA_AGENDADA",
  "PROPOSTA",
  "FECHADO",
  "PERDIDO",
];

const ESTAGIO_LABEL: Record<string, string> = {
  NOVO_LEAD: "Novo lead",
  CONTATO_FEITO: "Contato feito",
  VISITA_AGENDADA: "Visita agendada",
  PROPOSTA: "Proposta",
  FECHADO: "Fechado",
  PERDIDO: "Perdido",
};

const TIPO_INTERACAO_LABEL: Record<string, string> = {
  VISITA: "Visita",
  LIGACAO: "Ligação",
  MENSAGEM: "Mensagem",
  EMAIL: "E-mail",
  OUTRO: "Outro",
};

export default async function DetalheClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const pessoa = await prisma.pessoa.findUnique({
    where: { id },
    include: {
      interacoes: { orderBy: { dataHora: "desc" }, include: { imovel: true } },
    },
  });

  if (!pessoa) notFound();

  const atualizarEstagioComId = atualizarEstagioFunil.bind(null, pessoa.id);
  const registrarInteracaoComId = registrarInteracao.bind(null, pessoa.id);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">{pessoa.nome}</h1>
      <p className="text-gray-500 mb-6">
        {pessoa.telefone ?? "sem telefone"} · {pessoa.email ?? "sem e-mail"} ·{" "}
        {pessoa.papeis.join(", ")}
      </p>

      <div className="border rounded-lg p-4 mb-6">
        <label className="block text-sm font-medium mb-2">
          Estágio no funil
        </label>
        <form action={atualizarEstagioComId} className="flex gap-2">
          <select
            name="estagioFunil"
            defaultValue={pessoa.estagioFunil}
            className="border rounded-md px-3 py-2 text-sm"
          >
            {ESTAGIOS.map((estagio) => (
              <option key={estagio} value={estagio}>
                {ESTAGIO_LABEL[estagio]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="border rounded-md px-4 py-2 text-sm font-medium"
          >
            Atualizar
          </button>
        </form>
      </div>

      {pessoa.observacoes && (
        <div className="border rounded-lg p-4 mb-6 text-sm">
          <p className="font-medium mb-1">Observações</p>
          <p className="text-gray-700 whitespace-pre-line">
            {pessoa.observacoes}
          </p>
        </div>
      )}

      <div className="border rounded-lg p-4 mb-6">
        <p className="font-medium mb-2 text-sm">Registrar nova interação</p>
        <form
          action={registrarInteracaoComId}
          className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-sm"
        >
          <select name="tipo" className="border rounded-md px-3 py-2">
            {Object.entries(TIPO_INTERACAO_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            name="notas"
            placeholder="Notas"
            className="border rounded-md px-3 py-2 sm:col-span-2"
          />
          <button
            type="submit"
            className="bg-black text-white rounded-md px-4 py-2 hover:bg-gray-800 active:bg-gray-900 transition-colors"
          >
            Registrar
          </button>
        </form>
      </div>

      <div>
        <h2 className="font-semibold mb-3">Histórico de interações</h2>
        {pessoa.interacoes.length === 0 ? (
          <p className="text-gray-500 text-sm">Nenhuma interação registrada.</p>
        ) : (
          <ul className="space-y-3">
            {pessoa.interacoes.map((interacao) => (
              <li key={interacao.id} className="border rounded-lg p-3 text-sm">
                <p className="font-medium">
                  {TIPO_INTERACAO_LABEL[interacao.tipo]} ·{" "}
                  {interacao.dataHora.toLocaleString("pt-BR")}
                </p>
                {interacao.imovel && (
                  <p className="text-gray-500">
                    Imóvel: {interacao.imovel.titulo}
                  </p>
                )}
                {interacao.notas && (
                  <p className="text-gray-700 mt-1">{interacao.notas}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
