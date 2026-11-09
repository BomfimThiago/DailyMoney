import type { Meta, StoryObj } from "@storybook/react";
import { Section } from "./_helpers";
import { CategoryIcon } from "@/components/finance/category";
import { CAT } from "./fixtures";

const meta: Meta = { title: "Fundamentos" };
export default meta;

const COLORS: [string, string, string][] = [
  ["background", "bg-background", "Área de trabalho: branco"],
  ["sidebar", "bg-sidebar", "Barra lateral e topo do celular: segunda camada neutra"],
  ["card", "bg-card", "Cartões: branco, borda card-border, sem sombra"],
  ["card-border", "bg-card-border", "Borda dos cartões"],
  ["field", "bg-field", "Fundo dos controles: sempre branco"],
  ["muted", "bg-muted", "Faixas internas (cabeçalho de tabela, grupos)"],
  ["secondary", "bg-secondary", "Afundado: segmentado, hover, trilhos"],
  ["foreground", "bg-foreground", "Tinta: texto e gastos"],
  ["muted-foreground", "bg-muted-foreground", "Texto secundário"],
  ["subtle", "bg-subtle", "Meta, legendas, placeholders"],
  ["primary", "bg-primary", "Cobalto: só a ação principal e o dado em foco"],
  ["primary-soft", "bg-primary-soft", "Fundo de garantias/confiança"],
  ["success", "bg-success", "Dinheiro que entra"],
  ["warning", "bg-warning", "Pede ação / revisar"],
  ["transfer", "bg-transfer", "Transferência interna, IA (verde-azulado)"],
  ["destructive", "bg-destructive", "Só erros reais"],
  ["border", "bg-border", "Divisórias"],
  ["input", "bg-input", "Borda de campos"],
];

export const Cores: StoryObj = {
  render: () => (
    <Section title="Tokens de cor" note="Use sempre o nome do token (bg-primary, text-subtle…). Nunca hex.">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-5">
        {COLORS.map(([name, cls, note]) => (
          <div key={name} className="space-y-2">
            <div className={`h-16 rounded-xl shadow-control ${cls}`} />
            <div className="text-[13px] font-semibold">{name}</div>
            <div className="text-meta text-subtle">{note}</div>
          </div>
        ))}
      </div>
    </Section>
  ),
};

export const Tipografia: StoryObj = {
  render: () => (
    <Section
      title="Manrope em tudo (títulos semibold com tracking justo) + JetBrains Mono (texto bruto do extrato)"
      note="Sem rótulos pequenos em maiúsculas: a informação vai no título ou na frase abaixo dele."
    >
      <div className="space-y-5">
        <div className="flex items-baseline gap-4">
          <span className="font-display text-display-xl">Título da página</span>
          <code className="text-meta text-subtle">font-display text-display-xl · 28px</code>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="font-display text-display-lg">€ 4.183,52</span>
          <code className="text-meta text-subtle">
            font-display text-display-lg · 32px (o número que responde a tela)
          </code>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="font-display text-display-md">Revisão</span>
          <code className="text-meta text-subtle">font-display text-display-md · 24px (números irmãos)</code>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="font-display text-display-sm">Título de card</span>
          <code className="text-meta text-subtle">font-display text-display-sm · 20px (título de card)</code>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="text-body">Corpo e linhas de tabela</span>
          <code className="text-meta text-subtle">text-body (13,5px)</code>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="text-meta text-subtle">Meta e legendas</span>
          <code className="text-meta text-subtle">text-meta text-subtle</code>
        </div>
        <div className="flex items-baseline gap-4">
          <span className="font-mono text-[12px]">MERCADONA VALENCIA</span>
          <code className="text-meta text-subtle">font-mono (texto bruto do extrato)</code>
        </div>
      </div>
    </Section>
  ),
};

export const Sombras: StoryObj = {
  render: () => (
    <Section
      title="Elevação"
      note="Nada em repouso tem sombra: cartões e controles usam só a borda de 1px. Sombra só no que flutua (menus, popovers, sheets, modais)."
    >
      <div className="flex gap-8">
        {[
          ["shadow-control", "Controles: só o contorno"],
          ["border", "Cartões: borda de 1px, raio 20px"],
          ["shadow-overlay", "Menus, popovers, sheets, modais"],
        ].map(([c, n]) => (
          <div key={c} className="space-y-3">
            <div className={`h-28 w-56 rounded-2xl bg-card ${c}`} />
            <div className="text-[13px] font-semibold">{c}</div>
            <div className="max-w-56 text-meta text-subtle">{n}</div>
          </div>
        ))}
      </div>
    </Section>
  ),
};

export const IconesDeCategoria: StoryObj = {
  name: "Ícones de categoria",
  render: () => (
    <Section title="Categorias padrão" note="Ícone e cor vêm do banco (Category.icon / Category.color).">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
        {Object.values(CAT).map((c) => (
          <div key={c.name} className="flex items-center gap-3 text-[13.5px]">
            <CategoryIcon category={c} />
            {c.name}
          </div>
        ))}
      </div>
    </Section>
  ),
};
