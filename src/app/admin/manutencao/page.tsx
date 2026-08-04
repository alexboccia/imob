import { auth } from "@/lib/auth";
import { LimparMidiasButton } from "@/components/admin/LimparMidiasButton";

export default async function ManutencaoPage() {
  const session = await auth();
  const podeExecutar =
    session?.user.papel === "ADMINISTRADOR" || session?.user.papel === "GESTOR";

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Manutenção</h1>

      <div className="border rounded-lg p-5">
        <h2 className="font-medium mb-2">Fotos não utilizadas</h2>
        <p className="text-sm text-gray-500 mb-4">
          Remove do armazenamento (Cloudflare R2) fotos que foram enviadas
          durante o cadastro de um imóvel, mas nunca chegaram a ser salvas
          (ex: o formulário foi fechado antes de clicar em &quot;Salvar
          imóvel&quot;). Só remove arquivos com mais de 24 horas, para não
          afetar cadastros em andamento.
        </p>
        {podeExecutar ? (
          <LimparMidiasButton />
        ) : (
          <p className="text-sm text-gray-500">
            Apenas administradores ou gestores podem executar essa limpeza.
          </p>
        )}
      </div>
    </div>
  );
}
