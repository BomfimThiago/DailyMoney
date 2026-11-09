import type { Preview } from "@storybook/react";
import * as React from "react";
import "../src/app/globals.css";
import { TooltipProvider } from "../src/components/ui/tooltip";

const preview: Preview = {
  parameters: {
    layout: "padded",
    backgrounds: { default: "branco", values: [{ name: "branco", value: "#FFFFFF" }] },
    controls: { expanded: true },
    options: {
      storySort: {
        order: [
          "Leia primeiro",
          "Fundamentos",
          "Decisões",
          "Ações",
          "Formulário",
          "Seleção",
          "Exibição",
          "Finanças",
          "Dados",
          "Sobreposições",
          "Estrutura",
          "Feedback",
        ],
      },
    },
  },
  decorators: [
    (Story) => {
      return (
        <div className="font-sans text-foreground">
          <TooltipProvider delayDuration={200}>
            <Story />
          </TooltipProvider>
        </div>
      );
    },
  ],
};

export default preview;
