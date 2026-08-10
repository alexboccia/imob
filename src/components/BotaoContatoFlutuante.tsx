"use client";

import { useState } from "react";
import { motion } from "motion/react";
import {
  IconeMensagem,
  IconeTelefone,
  IconeEmail,
  IconeFechar,
} from "@/components/icons";
import { ModalContato } from "@/components/ModalContato";
import { Button } from "@/components/ui/button";

function OpcaoContato({
  icone,
  titulo,
  subtitulo,
  href,
  externo,
}: {
  icone: React.ReactNode;
  titulo: string;
  subtitulo: string;
  href: string;
  externo?: boolean;
}) {
  return (
    <a
      href={href}
      target={externo ? "_blank" : undefined}
      rel={externo ? "noopener noreferrer" : undefined}
      className="flex items-center gap-3 border rounded-xl p-3 hover:bg-gray-50 transition-colors"
    >
      <span className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center shrink-0">
        {icone}
      </span>
      <span>
        <span className="block font-medium text-sm">{titulo}</span>
        <span className="block text-xs text-gray-500">{subtitulo}</span>
      </span>
    </a>
  );
}

export function BotaoContatoFlutuante({
  nome,
  whatsapp,
  telefone,
  orgSlug,
}: {
  nome: string;
  whatsapp: string;
  telefone: string;
  orgSlug: string;
}) {
  const [aberto, setAberto] = useState(false);

  const whatsappDigitos = whatsapp.replace(/\D/g, "");
  const whatsappHref = `https://wa.me/${whatsappDigitos}?text=${encodeURIComponent(
    "Olá! Gostaria de falar com um corretor."
  )}`;
  const telefoneDigitos = telefone.replace(/\D/g, "");
  const telefoneHref = `tel:+${telefoneDigitos}`;

  return (
    <div className="fixed bottom-6 right-6 z-40">
      {/* Fica sempre montado (a animação do Motion só controla opacidade/
          escala) para o ModalContato dentro dele não perder o próprio
          estado quando o balão fecha. */}
      <motion.div
        initial={false}
        animate={
          aberto
            ? { opacity: 1, scale: 1, y: 0 }
            : { opacity: 0, scale: 0.95, y: 8 }
        }
        transition={{ duration: 0.15 }}
        aria-hidden={!aberto}
        className={`absolute bottom-16 right-0 w-80 max-w-[calc(100vw-3rem)] bg-white border rounded-xl shadow-xl p-4 ${
          aberto ? "" : "pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-lg">Contato</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setAberto(false)}
            aria-label="Fechar"
            className="text-gray-400 hover:text-gray-700"
          >
            <IconeFechar className="w-5 h-5" />
          </Button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Escolha como deseja entrar em contato
        </p>

        <div className="space-y-3">
          {whatsappDigitos && (
            <OpcaoContato
              icone={<IconeMensagem className="w-5 h-5" />}
              titulo={`WhatsApp ${nome}`}
              subtitulo="Fale conosco agora"
              href={whatsappHref}
              externo
            />
          )}
          {telefoneDigitos && (
            <OpcaoContato
              icone={<IconeTelefone className="w-5 h-5" />}
              titulo={`Ligar para ${nome}`}
              subtitulo={telefone}
              href={telefoneHref}
            />
          )}
          <ModalContato
            whatsappHref={whatsappDigitos ? whatsappHref : undefined}
            aoAbrir={() => setAberto(false)}
            className="w-full flex items-center gap-3 border rounded-xl p-3 hover:bg-gray-50 transition-colors text-left"
            orgSlug={orgSlug}
            nome={nome}
          >
            <span className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center shrink-0">
              <IconeEmail className="w-5 h-5" />
            </span>
            <span>
              <span className="block font-medium text-sm">
                Receber contato
              </span>
              <span className="block text-xs text-gray-500">
                Comprar, Vender, Marketing e Parcerias
              </span>
            </span>
          </ModalContato>
        </div>
      </motion.div>

      <Button
        type="button"
        size="icon"
        onClick={() => setAberto((a) => !a)}
        aria-label={aberto ? "Fechar contato" : "Abrir contato"}
        aria-expanded={aberto}
        className="size-14 rounded-full shadow-lg"
      >
        {aberto ? (
          <IconeFechar className="w-6 h-6" />
        ) : (
          <IconeMensagem className="w-6 h-6" />
        )}
      </Button>
    </div>
  );
}
