// Paleta de cores oferecida ao escolher a cor de uma categoria ou responsável.
// Fica num .ts (fora da regra de lint de telas) porque a cor é um dado salvo no
// banco (Category.color / Member.color), não um estilo: as telas nunca a aplicam
// direto — quem pinta é <CategoryIcon> / <MemberAvatar>.
// Inclui as cores das categorias padrão (src/lib/categories/defaults.ts).

export interface PaletteColor {
  value: string;
  label: string;
}

export const COLOR_PALETTE: PaletteColor[] = [
  { value: "#16a34a", label: "Verde" },
  { value: "#14b8a6", label: "Verde-água" },
  { value: "#06b6d4", label: "Ciano" },
  { value: "#0ea5e9", label: "Azul-claro" },
  { value: "#2563eb", label: "Azul" },
  { value: "#6366f1", label: "Anil" },
  { value: "#8b5cf6", label: "Roxo" },
  { value: "#ec4899", label: "Rosa" },
  { value: "#f43f5e", label: "Framboesa" },
  { value: "#ef4444", label: "Vermelho" },
  { value: "#f97316", label: "Laranja" },
  { value: "#eab308", label: "Amarelo" },
  { value: "#64748b", label: "Ardósia" },
  { value: "#94a3b8", label: "Cinza" },
];

/** Primeira cor da paleta que ninguém usa ainda (ou a primeira, se todas estiverem em uso). */
export function firstUnusedColor(used: string[]): string {
  const taken = new Set(used.map((c) => c.toLowerCase()));
  return (COLOR_PALETTE.find((c) => !taken.has(c.value)) ?? COLOR_PALETTE[0]).value;
}

export function colorLabel(value: string): string {
  return COLOR_PALETTE.find((c) => c.value === value.toLowerCase())?.label ?? "Cor atual";
}
