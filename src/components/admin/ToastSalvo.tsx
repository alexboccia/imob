"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function ToastSalvo() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const salvoNaUrl = searchParams.get("salvo") === "1";

  const [mostrado, setMostrado] = useState(salvoNaUrl);
  const [ultimoValor, setUltimoValor] = useState(salvoNaUrl);

  if (salvoNaUrl !== ultimoValor) {
    setUltimoValor(salvoNaUrl);
    if (salvoNaUrl) setMostrado(true);
  }

  useEffect(() => {
    if (salvoNaUrl) router.replace(pathname);
  }, [salvoNaUrl, pathname, router]);

  useEffect(() => {
    if (!mostrado) return;
    const timer = setTimeout(() => setMostrado(false), 3000);
    return () => clearTimeout(timer);
  }, [mostrado]);

  return (
    <div
      role="status"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-black text-white text-sm font-medium px-4 py-2.5 rounded-md shadow-lg transition-all duration-300 ${
        mostrado
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-2 pointer-events-none"
      }`}
    >
      Imóvel salvo com sucesso!
    </div>
  );
}
