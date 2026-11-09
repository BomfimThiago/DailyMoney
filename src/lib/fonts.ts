import { Manrope, JetBrains_Mono } from "next/font/google";

// Manrope: a única face do app (corpo, títulos e números, com algarismos tabulares; serifa
// foi testada e rejeitada) · JetBrains Mono: texto bruto do extrato.
// A variável continua --font-sans para o Tailwind não mudar de nome.
export const fontSans = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});
export const fontMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const fontVariables = `${fontSans.variable} ${fontMono.variable}`;
