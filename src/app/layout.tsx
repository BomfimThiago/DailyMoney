import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { fontVariables } from "@/lib/fonts";

export const metadata: Metadata = {
  // Cada rota tem o seu (ex.: "Importar · Daily Money"): leitor de tela e abas do navegador.
  title: { template: "%s · Daily Money", default: "Daily Money" },
  description: "Controle financeiro familiar multi-moeda",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={fontVariables}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
