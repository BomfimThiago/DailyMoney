"use client";

import * as React from "react";
import { Command } from "cmdk";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Grupo opcional (ex.: "Gastos" / "Entradas"). */
  group?: string;
  /** Texto extra usado na busca e mostrado discreto à direita. */
  hint?: string;
  /** Prefixo visual (ícone de categoria, avatar…). */
  leading?: React.ReactNode;
  disabled?: boolean;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  value?: string | null;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Mostra "Criar “texto”" quando a busca não encontra nada. */
  onCreate?: (label: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  /** Renderiza o gatilho com outro visual (ex.: pílula de categoria). */
  renderTrigger?: (selected: ComboboxOption | undefined) => React.ReactNode;
  /** Nome do campo para leitores de tela (ex.: "Categoria"). Padrão: o placeholder. */
  label?: string;
  /** Repassados ao gatilho (o <Field> usa para ligar rótulo e erro). */
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

/** Seleção com busca. Para listas longas: categorias, responsáveis, contas. */
export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Selecionar…",
  searchPlaceholder = "Buscar…",
  emptyText = "Nada encontrado",
  onCreate,
  invalid,
  disabled,
  className,
  renderTrigger,
  label,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": ariaInvalid,
}: ComboboxProps) {
  const a11y = { id, "aria-describedby": describedBy, "aria-invalid": ariaInvalid || invalid || undefined };
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selected = options.find((o) => o.value === value);
  const typed = query.trim();
  const creatable =
    Boolean(onCreate) && typed.length > 0 && !options.some((o) => o.label.toLowerCase() === typed.toLowerCase());
  const name = label ?? placeholder;

  const groups = React.useMemo(() => {
    const map = new Map<string, ComboboxOption[]>();
    for (const o of options) {
      const key = o.group ?? "";
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    return [...map.entries()];
  }, [options]);

  function pick(v: string) {
    onValueChange(v);
    setOpen(false);
    setQuery("");
  }

  return (
    // modal: necessário para a busca receber foco dentro de Sheet/Dialog (que
    // prendem o foco); sem isso digitar não fazia nada no painel de detalhe.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild disabled={disabled}>
        {renderTrigger ? (
          <button
            type="button"
            {...a11y}
            className={cn(
              "rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              className,
            )}
            data-invalid={invalid || undefined}
          >
            {/* Nome = rótulo oculto + o que aparece ("Categoria: Sem categoria"), não só "Categoria"
                (WCAG 2.5.3): quem fala o que vê consegue acionar por voz. */}
            <span className="sr-only">{name}: </span>
            {renderTrigger(selected)}
          </button>
        ) : (
          <button
            type="button"
            {...a11y}
            data-invalid={invalid || undefined}
            className={cn(
              "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-control bg-field px-3 text-[13.5px] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
              invalid && "border-destructive",
              className,
            )}
          >
            <span className={cn("flex min-w-0 items-center gap-2 truncate", !selected && "text-subtle")}>
              {selected?.leading}
              {selected ? selected.label : placeholder}
            </span>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-subtle" />
          </button>
        )}
      </PopoverTrigger>
      {/* Sem animação de saída: o popover é modal e, enquanto a saída roda, o Radix
          ainda bloqueia cliques fora — categorizar rápido na Revisão perdia o clique
          na próxima pílula. Entrada curta (100ms). */}
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0 data-[state=open]:duration-100 data-[state=closed]:hidden">
        <Command loop>
          <div className="flex items-center gap-2 border-b px-3">
            <Search aria-hidden className="size-4 text-subtle" />
            <Command.Input
              aria-label={`Buscar ${name.toLowerCase()}`}
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
              className="h-10 w-full bg-transparent text-[13.5px] outline-none placeholder:text-subtle"
            />
          </div>
          <Command.List className="max-h-72 overflow-y-auto overscroll-contain p-1">
            {creatable ? null : (
              <Command.Empty className="px-3 py-6 text-center text-meta text-subtle">{emptyText}</Command.Empty>
            )}
            {groups.map(([group, items]) => (
              <Command.Group
                key={group || "_"}
                heading={group || undefined}
                className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-meta [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-subtle"
              >
                {items.map((o) => (
                  <Command.Item
                    key={o.value}
                    value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                    disabled={o.disabled}
                    onSelect={() => pick(o.value)}
                    className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] outline-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-secondary"
                  >
                    {o.leading}
                    <span className="flex-1 truncate">{o.label}</span>
                    {o.hint ? <span className="text-meta text-subtle">{o.hint}</span> : null}
                    {o.value === value ? <Check aria-hidden className="size-4 text-primary" /> : null}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
            {/* Sempre que o nome digitado não existe exatamente: a busca aproximada mostra
                "Supermercado" para "Mercado", mas criar "Mercado" continua possível (e com Enter). */}
            {creatable ? (
              <Command.Item
                value={`criar ${typed}`}
                onSelect={() => {
                  onCreate?.(typed);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex cursor-default items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] font-semibold text-primary outline-none data-[selected=true]:bg-secondary"
              >
                <Plus aria-hidden className="size-4" /> Criar “{typed}”
              </Command.Item>
            ) : null}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
