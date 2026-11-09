"use client";

import * as React from "react";
import { Plus, Tags } from "lucide-react";
import { useCategories, type Category } from "@/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardDescription, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryIcon } from "@/components/finance/category";
import { EmptyState, ErrorState } from "@/components/states";
import { cn } from "@/lib/utils";
import { CategoryDetail } from "./_components/category-detail";
import { KIND_NOUN, KIND_OPTIONS, NewCategoryDialog } from "./_components/new-category-dialog";

type Kind = Category["kind"];

export default function CategoriesPage() {
  const categories = useCategories();
  const [kind, setKind] = React.useState<Kind>("EXPENSE");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const detailRef = React.useRef<HTMLDivElement>(null);

  const all = categories.data ?? [];
  const items = all.filter((c) => c.kind === kind);
  const selected = items.find((c) => c.id === selectedId) ?? items[0] ?? null;

  function select(id: string) {
    setSelectedId(id);
    // No celular o detalhe fica abaixo da lista: leva o usuário até ele.
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  return (
    <div>
      <PageHeader
        title="Categorias"
        description="Categorias padrão + as suas. O app aprende a categoria de cada estabelecimento quando você escolhe uma."
        actions={
          <>
            <Segmented aria-label="Tipo de categoria" options={KIND_OPTIONS} value={kind} onValueChange={setKind} />
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Nova categoria
            </Button>
          </>
        }
      />

      {categories.isLoading ? (
        <CategoriesSkeleton />
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => categories.refetch()} />
      ) : items.length === 0 || !selected ? (
        <EmptyState
          icon={<Tags />}
          title={`Nenhuma categoria de ${KIND_NOUN[kind]}`}
          hint={
            kind === "TRANSFER"
              ? "Movimentação é dinheiro que só muda de lugar: entre contas suas, aplicação e resgate, pagamento de cartão. Fica fora de Gastos e Entradas."
              : "Crie uma categoria para organizar suas transações."
          }
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Nova categoria
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardDescription>
                {items.length} {items.length === 1 ? "categoria" : "categorias"} de {KIND_NOUN[kind]}
                {kind === "TRANSFER" ? " · fora de Gastos e Entradas" : ""}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-2">
              <ul className="space-y-0.5">
                {items.map((c) => {
                  const active = c.id === selected.id;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        aria-current={active ? "true" : undefined}
                        onClick={() => select(c.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          active && "bg-secondary",
                        )}
                      >
                        <CategoryIcon category={c} size="sm" />
                        <span className={cn("min-w-0 flex-1 truncate text-body", active && "font-semibold")}>
                          {c.name}
                        </span>
                        <span className="shrink-0 text-meta text-subtle">{c.isDefault ? "Padrão" : "Sua"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <div ref={detailRef} className="scroll-mt-6">
            <CategoryDetail
              key={selected.id}
              category={selected}
              siblings={items}
              onDeleted={() => setSelectedId(null)}
            />
          </div>
        </div>
      )}

      <NewCategoryDialog
        open={creating}
        onOpenChange={setCreating}
        defaultKind={kind}
        existing={all}
        onCreated={(c) => {
          setKind(c.kind);
          setSelectedId(c.id);
        }}
      />
    </div>
  );
}

function CategoriesSkeleton() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]" aria-busy>
      <Card className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-1.5">
            <Skeleton className="size-6" />
            <Skeleton className="h-3.5 flex-1" />
          </div>
        ))}
      </Card>
      <Card className="space-y-6 p-6">
        <div className="flex items-center gap-4">
          <Skeleton className="size-11 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-20 w-full" />
      </Card>
    </div>
  );
}
