"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronRight } from "lucide-react";

export function FormDisclosure({
  titulo,
  children,
}: {
  titulo: string;
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="mb-6 border rounded-lg p-4">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1.5 font-medium text-sm cursor-pointer"
      >
        <motion.span
          animate={{ rotate: aberto ? 90 : 0 }}
          transition={{ duration: 0.15 }}
          className="inline-flex"
        >
          <ChevronRight className="size-4" />
        </motion.span>
        {titulo}
      </button>
      <AnimatePresence initial={false}>
        {aberto && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
