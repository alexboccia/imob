import { Wrench, KeyRound, Info } from "lucide-react";
import { ESTAGIO_OBRA_LABEL, formatarMesAno } from "@/lib/format";
import { IconeCheck } from "@/components/icons";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

const ORDEM = ["PRE_CONSTRUCTION", "UNDER_CONSTRUCTION", "READY_TO_MOVE"] as const;

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
        <Tooltip>
          <TooltipTrigger className="w-4 h-4 rounded-full border border-gray-300 text-gray-400 flex items-center justify-center cursor-help">
            <Info className="w-3 h-3" />
          </TooltipTrigger>
          <TooltipContent className="max-w-[240px] text-center font-normal">
            As datas abaixo são uma previsão de cada etapa da obra.
          </TooltipContent>
        </Tooltip>
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
                      ? "bg-primary text-primary-foreground"
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
                      ? "bg-success-muted border-success-muted-border"
                      : status === "atual"
                        ? "bg-primary border-primary"
                        : "bg-gray-100 border-gray-200"
                  }`}
                >
                  {status === "concluido" ? (
                    <span className="text-success">
                      <IconeCheck className="w-5 h-5" />
                    </span>
                  ) : estagio === "READY_TO_MOVE" ? (
                    <KeyRound
                      className={`w-5 h-5 ${
                        status === "atual" ? "text-primary-foreground" : "text-gray-400"
                      }`}
                    />
                  ) : (
                    <Wrench
                      className={`w-5 h-5 ${
                        status === "atual" ? "text-primary-foreground" : "text-gray-400"
                      }`}
                    />
                  )}
                </div>

                <p
                  className={`mt-2 text-xs font-semibold text-center uppercase ${
                    status === "concluido"
                      ? "text-success-muted-foreground"
                      : status === "atual"
                        ? "text-primary"
                        : "text-gray-400"
                  }`}
                >
                  {ESTAGIO_OBRA_LABEL[estagio]}
                </p>
                {estagio === "READY_TO_MOVE" &&
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
                      ? "bg-success"
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
