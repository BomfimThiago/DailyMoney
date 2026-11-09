import type { Metadata } from "next";

// Título da aba e do leitor de tela (a página é client component e não exporta metadata).
export const metadata: Metadata = { title: "Esqueci a senha" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
