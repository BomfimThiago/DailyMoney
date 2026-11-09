import type { Meta, StoryObj } from "@storybook/react";
import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Section } from "./_helpers";

const meta: Meta = { title: "Formulário" };
export default meta;

export const Campos: StoryObj = {
  render: () => (
    <div className="grid max-w-3xl grid-cols-2 gap-x-8 gap-y-6">
      <Field label="Descrição" htmlFor="d">
        <Input id="d" defaultValue="Pão de Açúcar" />
      </Field>
      <Field label="Data" htmlFor="dt" hint="Data da compra, não do lançamento">
        <Input id="dt" type="date" defaultValue="2026-08-14" />
      </Field>
      <Field label="Valor" htmlFor="v" error="Use vírgula para centavos: 412,90">
        <Input id="v" invalid defaultValue="412.9.0" />
      </Field>
      <Field label="Moeda" htmlFor="m">
        <Select id="m" defaultValue="BRL">
          <option>EUR</option>
          <option>USD</option>
          <option>BRL</option>
        </Select>
      </Field>
      <Field label="Busca">
        <Input icon={<Search />} placeholder="Buscar descrição…" />
      </Field>
      <Field label="Desabilitado">
        <Input disabled defaultValue="Importado do extrato" />
      </Field>
    </div>
  ),
};

export const CheckboxESwitch: StoryObj = {
  name: "Checkbox e Switch",
  render: function Render() {
    const [rule, setRule] = React.useState(true);
    const [internal, setInternal] = React.useState(false);
    return (
      <>
        <Section title="Checkbox" note="Seleção em lote e opções de confirmação.">
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2.5 text-[13.5px]">
              <Checkbox checked={rule} onCheckedChange={(v) => setRule(v === true)} />
              Criar regra para “pao de acucar”
            </label>
            <label className="flex items-center gap-2.5 text-[13.5px]">
              <Checkbox checked="indeterminate" />
              Selecionar todas (algumas marcadas)
            </label>
            <label className="flex items-center gap-2.5 text-[13.5px]">
              <Checkbox disabled />
              Desabilitado
            </label>
          </div>
        </Section>
        <Section title="Switch" note="Liga/desliga com efeito imediato (filtros, preferências).">
          <label className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
            <Switch checked={internal} onCheckedChange={setInternal} />
            Transferências internas
          </label>
          <Label className="mt-2 block">Estado: {internal ? "mostrando" : "ocultas"}</Label>
        </Section>
      </>
    );
  },
};
