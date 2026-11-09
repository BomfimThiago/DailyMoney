import type { Meta, StoryObj } from "@storybook/react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";

const meta: Meta = { title: "Leia primeiro/Regras de uso" };
export default meta;

const RULES: [string, string][] = [
  [
    "Telas só montam peças",
    "Páginas em src/app usam apenas componentes de @/components/ui, @/components/finance e @/components/states, e dados apenas via hooks de @/hooks. Nada de Radix, cmdk, useQuery ou api direto na página.",
  ],
  [
    "Sem cor solta",
    "Nada de hex, rgb ou classes de cor do Tailwind padrão (bg-red-500…). Só tokens: primary, success, warning, destructive, transfer, muted, subtle. Exceção: cor de categoria/responsável vem do banco e é aplicada pelos componentes.",
  ],
  [
    "Dinheiro só com <Money>",
    "Valores vêm como string/Decimal da API e são exibidos com <Money>. Gasto em tinta com “−”, entrada verde com “+”, transferência interna cinza.",
  ],
  [
    "Todo async tem 3 estados",
    "Carregando (Skeleton/LoadingState), erro (ErrorState com Tentar novamente) e vazio (EmptyState). Mutations usam Button loading + toast de erro.",
  ],
  [
    "Faltou um componente?",
    "Crie em src/components/ui (ou finance) com story aqui no Storybook antes de usar na tela.",
  ],
];

export const Regras: StoryObj = {
  render: () => (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="Daily Money · sistema visual"
        title="Regras de uso"
        description="O que toda tela nova precisa seguir."
      />
      <div className="flex flex-col gap-4">
        {RULES.map(([t, d], i) => (
          <Card key={t}>
            <CardContent className="flex gap-4">
              <span className="font-display text-display-md text-primary">{i + 1}</span>
              <div>
                <div className="text-[14px] font-semibold">{t}</div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted-foreground">{d}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  ),
};
