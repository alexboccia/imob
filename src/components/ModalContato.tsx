"use client";

import { useActionState, useState } from "react";
import { createPortal } from "react-dom";
import { enviarContato } from "@/app/(public)/actions";
import { siteConfig } from "@/lib/site-config";
import { IconeFechar } from "@/components/icons";

const estadoInicial = { sucesso: false, erro: undefined as string | undefined };

export function ModalContato({
  imovelId,
  mensagemPreenchida = "",
  whatsappHref,
  className,
  aoAbrir,
  children,
}: {
  imovelId?: string;
  mensagemPreenchida?: string;
  whatsappHref?: string;
  className?: string;
  aoAbrir?: () => void;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, formAction, pendente] = useActionState(
    enviarContato,
    estadoInicial
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          aoAbrir?.();
          setAberto(true);
        }}
        className={className}
      >
        {children}
      </button>

      {aberto &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
            onClick={() => setAberto(false)}
          >
            <div
              className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full grid grid-cols-1 sm:grid-cols-[220px_1fr] max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="absolute top-3 right-3 text-gray-500 hover:text-gray-800"
              >
                <IconeFechar className="w-5 h-5" />
              </button>

              <div className="bg-gray-50 p-6 flex flex-col gap-3 border-b sm:border-b-0 sm:border-r">
                <div className="w-14 h-14 rounded-md bg-black text-white flex items-center justify-center font-bold text-xl">
                  {siteConfig.nome.charAt(0).toUpperCase()}
                </div>
                <p className="font-semibold">{siteConfig.nome}</p>
                {whatsappHref && (
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Falar no WhatsApp
                  </a>
                )}
              </div>

              <div className="p-6">
                <h2 className="font-semibold mb-4">Enviar mensagem</h2>

                {estado.sucesso ? (
                  <p className="text-green-700 bg-green-50 border border-green-200 rounded-md px-4 py-3 text-sm">
                    Mensagem enviada com sucesso! Em breve entraremos em
                    contato.
                  </p>
                ) : (
                  <form action={formAction} className="space-y-3">
                    {imovelId && (
                      <input type="hidden" name="imovelId" value={imovelId} />
                    )}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Nome
                      </label>
                      <input
                        name="nome"
                        placeholder="Nome"
                        required
                        className="w-full border rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Telefone
                      </label>
                      <input
                        name="telefone"
                        placeholder="Telefone"
                        className="w-full border rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        E-mail
                      </label>
                      <input
                        name="email"
                        type="email"
                        placeholder="E-mail"
                        className="w-full border rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Mensagem
                      </label>
                      <textarea
                        name="mensagem"
                        required
                        rows={4}
                        defaultValue={mensagemPreenchida}
                        className="w-full border rounded-md px-3 py-2 text-sm"
                      />
                    </div>
                    {estado.erro && (
                      <p className="text-red-600 text-sm">{estado.erro}</p>
                    )}
                    <button
                      type="submit"
                      disabled={pendente}
                      className="w-full bg-blue-600 text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-blue-700 active:bg-blue-800 transition-colors disabled:opacity-50"
                    >
                      {pendente ? "Enviando..." : "Enviar mensagem"}
                    </button>
                    <p className="text-xs text-gray-400">
                      Seus dados serão usados apenas para retornarmos seu
                      contato{imovelId ? " sobre este imóvel" : ""}.
                    </p>
                  </form>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
