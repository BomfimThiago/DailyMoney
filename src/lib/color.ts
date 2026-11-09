// Tintas de identidade a partir da cor do banco (Category.color, Member.color).
// Estilo "pastel": fundo pálido do próprio matiz + tinta escura do mesmo matiz,
// sempre com contraste de texto ≥ 4,5:1. Só para componentes (telas não usam cor solta).

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

const css = (h: number, s: number, l: number) =>
  `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;

export interface Tint {
  /** Fundo pálido do matiz (chips, avatares, ladrilhos). */
  bg: string;
  /** Tinta escura do mesmo matiz (texto sobre `bg`). */
  ink: string;
  /** O matiz em tom médio, para marcas de dado pequenas (barra, ponto). */
  mark: string;
}

const NEUTRAL: Tint = { bg: "hsl(210 21% 94%)", ink: "hsl(210 7% 24%)", mark: "hsl(210 4% 42%)" };

/** Fundo pálido + tinta escura do mesmo matiz da cor do banco. */
export function tint(hex: string | null | undefined): Tint {
  const hsl = hex ? hexToHsl(hex) : null;
  if (!hsl) return NEUTRAL;
  const [h, s] = hsl;
  if (s < 0.12) return NEUTRAL;
  const sat = Math.min(s, 0.85);
  return { bg: css(h, sat, 0.93), ink: css(h, Math.min(sat, 0.7), 0.26), mark: css(h, Math.min(sat, 0.65), 0.42) };
}
