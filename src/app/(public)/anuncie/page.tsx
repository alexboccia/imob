import type { Metadata } from "next";
import { AnuncieForm } from "@/components/AnuncieForm";

export const metadata: Metadata = {
  title: "Anuncie seu imóvel",
  description:
    "Conte um pouco sobre o seu imóvel e um corretor entrará em contato para avaliar e preparar o anúncio.",
};

export default function AnunciePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold mb-2">Anuncie seu imóvel</h1>
      <p className="text-gray-500 mb-8">
        Conte um pouco sobre o seu imóvel e um corretor entrará em contato
        para avaliar e preparar o anúncio.
      </p>
      <AnuncieForm />
    </div>
  );
}
