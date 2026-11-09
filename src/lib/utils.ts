import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// O tailwind-merge precisa conhecer os tamanhos de fonte do tema (tailwind.config.ts);
// sem isso ele acha que `text-meta`/`text-display-*` são cores e os descarta
// quando aparece uma cor junto (ex.: "text-meta text-subtle").
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["eyebrow", "meta", "body", "display-sm", "display-md", "display-lg", "display-xl"] }],
      shadow: [{ shadow: ["surface", "control", "overlay"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
