import { Wrench, KeyRound, Info } from "lucide-react";
import { ESTAGIO_OBRA_LABEL, formatarMesAno } from "@/lib/format";
import { IconeCheck } from "@/components/icons";

const ORDEM = ["NA_PLANTA", "EM_CONSTRUCAO", "PRONTO_PARA_MORAR"] as const;

export function EvolucaoObra({
  estagioObra,
  previsaoEntrega,
}: {
  estagioObra: string | null;
  previsaoEntrega: Date | null;
}) {
  const indiceAtual = ORDEM.indexOf(estagioObra as (typeof ORDEM)[number]);
  if (indiceAtual === -1) return null;

  return (
    <div className="border rounded-lg p-5">
      <h2 className="font-semibold mb-6 flex items-center gap-1.5">
        Evolução da obra
        <span className="relative inline-flex group">
          <span className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center cursor-help">
            <Info className="w-3 h-3" />
          </span>
          <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[240px] rounded-md bg-gray-900 px-3 py-2 text-xs font-normal text-white text-center opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-opacity z-10">
            As datas abaixo são uma previsão de cada etapa da obra.
            <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-900 rotate-45" />
          </span>
        </span>
      </h2>

      <div className="flex items-start">
        {ORDEM.map((estagio, i) => {
          const status =
            i < indiceAtual ? "concluido" : i === indiceAtual ? "atual" : "futuro";

          return (
            <div key={estagio} className="flex items-start flex-1 last:flex-none">
              <div className="flex flex-col items-center w-28 sm:w-32">
                <span
                  className={`mb-1 h-5 flex items-center justify-center text-[10px] font-semibold px-2 rounded ${
                    status === "atual"
                      ? "bg-gray-900 text-white"
                      : status === "futuro"
                        ? "bg-gray-200 text-gray-600"
                        : "invisible"
                  }`}
                >
                  {status === "atual" ? "ATUAL" : "PREVISÃO"}
                </span>

                <div
                  className={`w-full h-16 rounded-lg flex items-center justify-center border ${
                    status === "concluido"
                      ? "bg-green-50 border-green-300"
                      : status === "atual"
                        ? "bg-gray-900 border-gray-900"
                        : "bg-gray-100 border-gray-200"
                  }`}
                >
                  {status === "concluido" ? (
                    <span className="text-green-600">
                      <IconeCheck className="w-5 h-5" />
                    </span>
                  ) : estagio === "PRONTO_PARA_MORAR" ? (
                    <KeyRound
                      className={`w-5 h-5 ${
                        status === "atual" ? "text-white" : "text-gray-400"
                      }`}
                    />
                  ) : (
                    <Wrench
                      className={`w-5 h-5 ${
                        status === "atual" ? "text-white" : "text-gray-400"
                      }`}
                    />
                  )}
                </div>

                <p
                  className={`mt-2 text-xs font-semibold text-center uppercase ${
                    status === "concluido"
                      ? "text-green-700"
                      : status === "atual"
                        ? "text-gray-900"
                        : "text-gray-400"
                  }`}
                >
                  {ESTAGIO_OBRA_LABEL[estagio]}
                </p>
                {estagio === "PRONTO_PARA_MORAR" &&
                  status !== "concluido" &&
                  previsaoEntrega && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatarMesAno(previsaoEntrega)}
                    </p>
                  )}
              </div>

              {i < ORDEM.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mt-14 mx-1 ${
                    i < indiceAtual
                      ? "bg-green-400"
                      : "border-t-2 border-dashed border-gray-300"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
