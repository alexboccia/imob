"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { toast } from "sonner";

export function ToastSalvo() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const salvoNaUrl = searchParams.get("salvo") === "1";

  useEffect(() => {
    if (!salvoNaUrl) return;
    toast.success("Imóvel salvo com sucesso!");
    router.replace(pathname);
  }, [salvoNaUrl, pathname, router]);

  return null;
}
