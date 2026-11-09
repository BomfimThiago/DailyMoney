import type { Meta, StoryObj } from "@storybook/react";
import { Check, MoreHorizontal, Plus, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { Row, Section } from "./_helpers";

const meta: Meta<typeof Button> = {
  title: "Ações/Button",
  component: Button,
  args: { children: "Importar extrato", variant: "default", size: "default", loading: false, disabled: false },
  argTypes: {
    variant: { control: "inline-radio", options: ["default", "secondary", "ghost", "destructive", "link"] },
    size: { control: "inline-radio", options: ["sm", "default", "lg"] },
  },
};
export default meta;
type S = StoryObj<typeof Button>;

export const Playground: S = {};

export const Variacoes: S = {
  name: "Variações",
  render: () => (
    <>
      <Section title="Variantes" note="1 primário por área. Secundário flutua com sombra. Ghost para ações terciárias.">
        <Row>
          <Button>
            <Upload />
            Importar extrato
          </Button>
          <Button variant="secondary">Salvar e continuar depois</Button>
          <Button variant="ghost">Descartar</Button>
          <Button variant="destructive">
            <Trash2 />
            Excluir
          </Button>
          <Button variant="link">Ver todas</Button>
        </Row>
      </Section>
      <Section title="Tamanhos">
        <Row>
          <Button size="sm">Pequeno</Button>
          <Button>Padrão</Button>
          <Button size="lg">Grande (celular)</Button>
        </Row>
      </Section>
      <Section title="Só ícone" note="Sempre com aria-label e tooltip.">
        <Row>
          <Tooltip content="Mais ações">
            <Button variant="secondary" size="icon-sm" aria-label="Mais ações">
              <MoreHorizontal />
            </Button>
          </Tooltip>
          <Tooltip content="Rejeitar linha">
            <Button variant="secondary" size="icon-sm" aria-label="Rejeitar">
              <X />
            </Button>
          </Tooltip>
          <Tooltip content="Aceitar linha">
            <Button size="icon-sm" aria-label="Aceitar">
              <Check />
            </Button>
          </Tooltip>
          <Tooltip content="Nova transação">
            <Button variant="ghost" size="icon" aria-label="Nova">
              <Plus />
            </Button>
          </Tooltip>
        </Row>
      </Section>
      <Section title="Estados" note="loading em toda mutation: desabilita e mostra spinner.">
        <Row>
          <Button loading>Confirmando…</Button>
          <Button variant="secondary" loading>
            Salvando…
          </Button>
          <Button disabled>Desabilitado</Button>
          <div className="rounded-2xl bg-foreground p-3">
            <Button variant="inverse">Confirmar 51 transações</Button>
          </div>
        </Row>
      </Section>
    </>
  ),
};
