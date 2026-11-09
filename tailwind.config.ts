import type { Config } from "tailwindcss";

const hsl = (v: string) => `hsl(var(--${v}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}", "./.storybook/**/*.{ts,tsx}"],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "Manrope", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        eyebrow: ["11px", { lineHeight: "14px", letterSpacing: "0.12em", fontWeight: "600" }],
        meta: ["13px", { lineHeight: "18px" }],
        body: ["15px", { lineHeight: "22px" }],
        // Tamanhos vêm de CSS vars (globals.css) para permitir o tema editorial.
        "display-sm": ["var(--display-sm)", { lineHeight: "1.3" }],
        "display-md": ["var(--display-md)", { lineHeight: "1.2" }],
        "display-lg": ["var(--display-lg)", { lineHeight: "1.1" }],
        "display-xl": ["var(--display-xl)", { lineHeight: "1.15" }],
      },
      colors: {
        border: hsl("border"),
        input: hsl("input"),
        // contorno que identifica o controle (campo, checkbox, switch desligado): ≥ 3:1 no branco
        control: hsl("control-border"),
        ring: hsl("ring"),
        background: hsl("background"),
        foreground: hsl("foreground"),
        subtle: hsl("subtle"),
        primary: {
          DEFAULT: hsl("primary"),
          foreground: hsl("primary-foreground"),
          soft: hsl("primary-soft"),
          ink: hsl("primary-ink"),
        },
        secondary: { DEFAULT: hsl("secondary"), foreground: hsl("secondary-foreground") },
        destructive: {
          DEFAULT: hsl("destructive"),
          foreground: hsl("destructive-foreground"),
          soft: hsl("destructive-soft"),
        },
        success: {
          DEFAULT: hsl("success"),
          foreground: hsl("success-foreground"),
          soft: hsl("success-soft"),
        },
        warning: { DEFAULT: hsl("warning"), soft: hsl("warning-soft") },
        transfer: { DEFAULT: hsl("transfer"), soft: hsl("transfer-soft") },
        muted: { DEFAULT: hsl("muted"), foreground: hsl("muted-foreground") },
        accent: { DEFAULT: hsl("accent"), foreground: hsl("accent-foreground") },
        card: { DEFAULT: hsl("card"), foreground: hsl("card-foreground"), border: hsl("card-border") },
        /** Fundo de controles (campos, botões secundários, chips): sempre branco. */
        field: hsl("field"),
        /** Barra lateral e barra do celular (segunda camada neutra). */
        sidebar: { DEFAULT: hsl("sidebar"), border: hsl("sidebar-border") },
        popover: { DEFAULT: hsl("popover"), foreground: hsl("popover-foreground") },
      },
      borderRadius: {
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        xl: "calc(var(--radius) + 2px)",
        "2xl": "calc(var(--radius) + 4px)",
        /** Cartões: raio grande único do estilo (20px). */
        card: "20px",
      },
      boxShadow: {
        // Nada em repouso tem sombra: cartões usam 1px de borda (`border`), sem `shadow-surface`.
        surface: "none",
        // Controles: só o contorno de 1px, um passo mais escuro que o cartão.
        control: "0 0 0 1px hsl(var(--input))",
        // Só o que flutua (popovers, menus, sheets) ganha sombra.
        overlay: "0 0 0 1px rgba(16,24,40,.08), 0 12px 32px -8px rgba(16,24,40,.18)",
      },
      // Curvas de movimento (tokens). out-strong: menus, popovers, acordeão · drawer: painéis laterais.
      transitionTimingFunction: {
        "out-strong": "cubic-bezier(0.23, 1, 0.32, 1)",
        drawer: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        // Barra indeterminada: atravessa o trilho (um bloco pulsando parado parecia travado em 33%).
        "progress-indeterminate": { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(300%)" } },
      },
      animation: {
        "accordion-down": "accordion-down 200ms cubic-bezier(0.23, 1, 0.32, 1)",
        "accordion-up": "accordion-up 150ms cubic-bezier(0.23, 1, 0.32, 1)",
        "progress-indeterminate": "progress-indeterminate 1.2s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
