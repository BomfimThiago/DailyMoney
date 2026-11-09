import type { StorybookConfig } from "@storybook/react-vite";
import { fileURLToPath } from "node:url";

// Vite (não o preset de Next): os componentes de UI não dependem do Next, e o
// preset @storybook/nextjs quebra com o webpack embutido do Next 14.2.
const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-essentials", "@storybook/addon-a11y"],
  framework: { name: "@storybook/react-vite", options: {} },
  core: { disableTelemetry: true },
  async viteFinal(cfg) {
    // tsconfig usa jsx "preserve" (do Next); no Vite precisamos do runtime automático.
    cfg.esbuild = { ...(cfg.esbuild || {}), jsx: "automatic", jsxImportSource: "react" };
    cfg.resolve = cfg.resolve ?? {};
    cfg.resolve.alias = {
      ...(cfg.resolve.alias as Record<string, string>),
      "@": fileURLToPath(new URL("../src", import.meta.url)),
    };
    return cfg;
  },
};

export default config;
