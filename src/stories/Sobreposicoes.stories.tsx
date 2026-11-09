import type { Meta, StoryObj } from "@storybook/react";
import { FileText, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetTrigger } from "@/components/ui/sheet";
import { Eyebrow } from "@/components/ui/page-header";
import { Combobox } from "@/components/ui/combobox";
import { CategoryIcon } from "@/components/finance/category";
import { CurrencyTag } from "@/components/finance/currency-tag";
import { Money } from "@/components/finance/money";
import { CAT } from "./fixtures";
import { CategoryOptions } from "./_shared";
import { Row } from "./_helpers";

const meta: Meta = { title: "Sobreposições" };
export default meta;

export const Modal: StoryObj = {
  name: "Dialog (confirmação)",
  render: () => (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive">Excluir importação</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir esta importação?</DialogTitle>
          <DialogDescription>
            As 63 linhas lidas e ainda não confirmadas serão descartadas. Transações já confirmadas não são afetadas.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancelar</Button>
          </DialogClose>
          <Button variant="destructive">Excluir</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const PainelLateral: StoryObj = {
  name: "Sheet (detalhe da transação)",
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="secondary">Abrir detalhe</Button>
      </SheetTrigger>
      <SheetContent title="Detalhe da transação">
        <SheetBody>
          <div className="flex items-center gap-3.5">
            <CategoryIcon category={CAT.mercado} size="lg" />
            <div>
              <div className="font-display text-display-sm">Pão de Açúcar</div>
              <div className="mt-1 flex items-center gap-1.5 text-meta text-subtle">
                Sex, 14 ago 2026 · Wise <CurrencyTag currency="BRL" />
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-muted px-5 pb-2 pt-4">
            <Eyebrow>Valor original</Eyebrow>
            <Money value="412.90" currency="BRL" kind="EXPENSE" size="display" align="left" className="mt-1" />
            <div className="mt-3 divide-y border-t">
              <div className="flex items-center justify-between py-2.5 text-meta text-subtle">
                <span className="flex items-center gap-2">
                  <CurrencyTag currency="EUR" />1 EUR = 6,4196 BRL
                </span>
                <Money value="64.32" currency="EUR" kind="EXPENSE" />
              </div>
              <div className="flex items-center justify-between py-2.5 text-meta text-subtle">
                <span className="flex items-center gap-2">
                  <CurrencyTag currency="USD" />1 EUR = 1,1698 USD
                </span>
                <Money value="75.24" currency="USD" kind="EXPENSE" />
              </div>
              <div className="flex items-center gap-1.5 py-2.5 text-[11.5px] text-subtle">
                <Info className="size-3.5" />
                Taxa BCE de 14/08/2026 via Frankfurter
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Categoria">
              <Combobox options={CategoryOptions} value="mercado" onValueChange={() => {}} />
            </Field>
            <Field label="Data">
              <Input type="date" defaultValue="2026-08-14" />
            </Field>
          </div>
          <label className="flex gap-2.5 rounded-xl bg-primary-soft px-4 py-3 text-[12.5px] text-primary-ink">
            <Checkbox defaultChecked />
            <span>
              <b>Criar regra:</b> sempre classificar <span className="font-mono">pao de acucar</span> como Mercado
            </span>
          </label>
          <div className="space-y-2 text-[12.5px] text-muted-foreground">
            <div className="flex items-center gap-2">
              <FileText className="size-3.5 text-subtle" />
              Importado de statement_BRL_…_08-19.pdf
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-3.5 text-subtle" />
              Revisado por você · confiança da IA 96%
            </div>
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="ghost">Excluir</Button>
          <Row>
            <Button variant="secondary">Cancelar</Button>
            <Button>Salvar alterações</Button>
          </Row>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const PopoverStory: StoryObj = {
  name: "Popover",
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary">Ajustar câmbio</Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4">
        <div className="space-y-3">
          <Field label="1 EUR =" hint="Sobrescreve a taxa BCE só nesta transação.">
            <Input defaultValue="6,4196" />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm">
              Cancelar
            </Button>
            <Button size="sm">Aplicar</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  ),
};
