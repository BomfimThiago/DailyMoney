"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Check, CheckCircle2, ChevronRight, RefreshCw, Trash2 } from "lucide-react";
import {
  useCategories,
  useCommitUpload,
  useDeletingStaged,
  useMembers,
  usePatchStaged,
  useReprocessUpload,
  useStaged,
  type CommitResult,
  type ReimportPlan,
  type StagedPatch,
  type StagedTransaction,
} from "@/hooks";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/stat-card";
import { Stepper } from "@/components/ui/stepper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState } from "@/components/states";
import { readWarningLines } from "@/lib/ingest/read-warnings";
import { isUndecidedDuplicate } from "@/lib/ingest/cross-source";
import { ConfirmBar } from "./_components/confirm-bar";
import { DeleteRowsDialog } from "./_components/delete-rows-dialog";
import { MemberSelect } from "./_components/member-select";
import { ReviewTable } from "./_components/review-table";

const STEPS = ["Upload", "Leitura", "Revisão", "Confirmado"];
type TabKey = "review" | "ready" | "internal" | "duplicate" | "all";

const RANGE = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function dateRange(rows: StagedTransaction[]): string | null {
  if (rows.length === 0) return null;
  const sorted = rows.map((r) => r.date).sort();
  const from = RANGE.format(new Date(sorted[0]));
  const to = RANGE.format(new Date(sorted[sorted.length - 1]));
  return from === to ? from : `${from} – ${to}`;
}

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** "Confirmar vai criar 3 novas, corrigir 2, manter 7 iguais e remover 1 que não está mais no arquivo." */
function reimportSummary(p: ReimportPlan): string {
  const parts = [
    p.create ? `criar ${n(p.create, "nova", "novas")}` : null,
    p.update ? `corrigir ${n(p.update, "transação", "transações")}` : null,
    p.same ? `manter ${n(p.same, "igual", "iguais")}` : null,
    p.remove ? `remover ${n(p.remove, "que não está mais no arquivo", "que não estão mais no arquivo")}` : null,
    p.duplicate ? `pular ${n(p.duplicate, "que já está", "que já estão")} em Transações por outra fonte` : null,
  ].filter(Boolean) as string[];
  if (!parts.length) return "Confirmar não muda nada.";
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}` : parts[0];
  return `Confirmar vai ${list}.`;
}

function commitSummary(r: CommitResult): string {
  const parts = [
    r.committed ? n(r.committed, "nova", "novas") : null,
    r.updated ? n(r.updated, "corrigida", "corrigidas") : null,
    r.unchanged ? n(r.unchanged, "igual", "iguais") : null,
    r.removed ? n(r.removed, "removida", "removidas") : null,
    r.skippedDuplicates ? `${n(r.skippedDuplicates, "já estava", "já estavam")} em Transações` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(" · ")}.` : "Nada mudou.";
}

export default function ReviewPage() {
  const { id } = useParams<{ id: string }>();
  const staged = useStaged(id);
  const categories = useCategories();
  const members = useMembers();
  const commit = useCommitUpload(id);
  const deleting = useDeletingStaged(id);
  const bulk = usePatchStaged(id);
  const reprocess = useReprocessUpload();

  const [tab, setTab] = React.useState<TabKey | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = React.useState<null | "accept" | "member" | "internal" | "duplicates">(null);
  const [bulkDelete, setBulkDelete] = React.useState(false);
  // Linhas que pediram revisão nesta visita: continuam na aba depois de aceitas
  // (marcadas "Revisada"), para a lista não pular enquanto o usuário trabalha.
  const [seenReview, setSeenReview] = React.useState<Set<string>>(() => new Set());

  const upload = staged.data?.upload;
  const rows = React.useMemo(() => staged.data?.staged ?? [], [staged.data]);
  // Logo após confirmar (antes do refetch) já tratamos como confirmada.
  const plan = staged.data?.plan ?? null;
  const committed =
    upload?.status === "COMMITTED" ||
    (commit.isSuccess &&
      commit.data.committed +
        commit.data.updated +
        commit.data.unchanged +
        commit.data.removed +
        commit.data.skippedDuplicates >
        0);
  const reading = upload?.status === "PENDING" || upload?.status === "PARSING";
  const pending = rows.filter((r) => r.needsReview).length;
  const undecided = rows.filter(isUndecidedDuplicate);
  const warnings = readWarningLines(upload?.error);

  const reviewIds = React.useMemo(() => {
    const ids = new Set(seenReview);
    rows.forEach((r) => r.needsReview && ids.add(r.id));
    return ids;
  }, [rows, seenReview]);

  React.useEffect(() => {
    if (reviewIds.size !== seenReview.size) setSeenReview(reviewIds);
  }, [reviewIds, seenReview]);

  React.useEffect(() => {
    if (tab === null && staged.data) setTab(!committed && pending > 0 ? "review" : "all");
  }, [tab, staged.data, committed, pending]);

  async function bulkApply(kind: NonNullable<typeof bulkBusy>, data: (r: StagedTransaction) => StagedPatch) {
    const targets = rows.filter((r) => selected.has(r.id));
    setBulkBusy(kind);
    // Cada falha já vira toast no hook; as que deram certo ficam.
    await Promise.allSettled(targets.map((r) => bulk.mutateAsync({ id: r.id, data: data(r) })));
    setBulkBusy(null);
    setSelected(new Set());
  }

  const breadcrumb = (
    <nav aria-label="Trilha" className="flex min-w-0 items-center gap-1.5">
      <Link href="/upload" className="hover:text-foreground">
        Importar
      </Link>
      <ChevronRight aria-hidden className="size-3.5 shrink-0" />
      <span className="truncate text-muted-foreground">{upload?.filename ?? "…"}</span>
    </nav>
  );

  if (staged.isLoading || categories.isLoading || members.isLoading) {
    return (
      <div className="space-y-6" aria-busy>
        <PageHeader className="pb-0" breadcrumb={breadcrumb} title="Revisar importação" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[104px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
    );
  }

  if (staged.isError || categories.isError || members.isError) {
    const failed = staged.isError ? staged : categories.isError ? categories : members;
    return (
      <div className="space-y-6">
        <PageHeader className="pb-0" breadcrumb={breadcrumb} title="Revisar importação" />
        <ErrorState
          title={
            staged.isError ? "Não deu para carregar a importação" : "Não deu para carregar categorias e responsáveis"
          }
          error={failed.error}
          onRetry={() => {
            if (staged.isError) staged.refetch();
            if (categories.isError) categories.refetch();
            if (members.isError) members.refetch();
          }}
        />
      </div>
    );
  }

  if (!upload) return null;

  const cats = categories.data ?? [];
  const people = members.data ?? [];
  const internal = rows.filter((r) => r.isInternalTransfer).length;
  const currencies = Array.from(new Set(rows.map((r) => r.baseCurrency))).join(" / ");
  const description = [
    upload.bank,
    currencies || null,
    dateRange(rows),
    `${rows.length} ${rows.length === 1 ? "linha lida" : "linhas lidas"}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const current = committed ? 3 : reading ? 1 : 2;
  const activeTab: TabKey = tab ?? (!committed && pending > 0 ? "review" : "all");

  const lists: Record<TabKey, StagedTransaction[]> = {
    review: rows.filter((r) => reviewIds.has(r.id)),
    ready: rows.filter((r) => !r.needsReview && r.match !== "DUPLICATE"),
    internal: rows.filter((r) => r.isInternalTransfer && r.match !== "DUPLICATE"),
    duplicate: rows.filter((r) => r.match === "DUPLICATE"),
    all: rows,
  };
  const empties: Record<TabKey, { title: string; hint: string }> = {
    review: { title: "Nada para revisar", hint: "Todas as linhas estão claras. Confira as prontas e confirme." },
    ready: { title: "Nenhuma linha pronta ainda", hint: "Aceite ou corrija as linhas que estão em revisão." },
    internal: {
      title: "Nenhuma transferência interna",
      hint: "Marque “Interna” quando o dinheiro só mudou de uma conta sua para outra.",
    },
    duplicate: {
      title: "Nada repetido",
      hint: "Nenhuma linha já estava em Transações vinda de outro extrato ou do banco conectado.",
    },
    all: { title: "Nenhuma linha", hint: "Este arquivo não gerou transações." },
  };

  return (
    <div className="space-y-6">
      <PageHeader
        className="pb-0"
        breadcrumb={breadcrumb}
        eyebrow={`Importar · passo ${current + 1} de 4`}
        title="Revisar importação"
        description={description}
      />

      <Stepper steps={STEPS} current={current} />

      {/* Reimportação: o mesmo arquivo (ou linhas já gravadas) — confirmar atualiza, não duplica. */}
      {plan &&
      !committed &&
      (plan.previous.length > 0 || plan.update + plan.same + plan.remove + plan.duplicate > 0) ? (
        <Alert
          tone="info"
          title={
            plan.previous.length > 0
              ? `Este arquivo já foi importado em ${RANGE.format(new Date(plan.previous[0].createdAt))}.`
              : "Algumas linhas já estão em Transações."
          }
        >
          {reimportSummary(plan)} Categoria, responsável e transferência interna ficam como você deixou; nada é
          duplicado.
        </Alert>
      ) : null}

      {/* Estado da importação: lendo, falhou, confirmada. */}
      {reading ? (
        <div className="space-y-2">
          <Alert
            tone="info"
            title="Ainda lendo este arquivo."
            action={
              <Button size="sm" variant="secondary" loading={staged.isFetching} onClick={() => staged.refetch()}>
                Atualizar
              </Button>
            }
          >
            As linhas aparecem aqui assim que a leitura terminar.
          </Alert>
          <Progress tone="info" label="Lendo arquivo" />
        </div>
      ) : null}

      {upload.status === "FAILED" || (committed && upload.error && !commit.data) ? (
        <Alert
          tone="danger"
          title={
            committed
              ? "Parte das linhas não foi gravada."
              : rows.length
                ? "A confirmação falhou."
                : "Não deu para ler este arquivo."
          }
          action={
            rows.length ? null : (
              <Button
                size="sm"
                variant="secondary"
                loading={reprocess.isPending}
                onClick={() => reprocess.mutate(id, { onSuccess: () => staged.refetch() })}
              >
                {reprocess.isPending ? null : <RefreshCw />}
                Reprocessar
              </Button>
            )
          }
        >
          {upload.error ?? "Erro desconhecido."}
          {rows.length && !committed ? " Corrija as linhas se preciso e confirme de novo." : null}
        </Alert>
      ) : null}

      {/* Avisos da leitura (linhas puladas, descartadas, saldo que não fecha…): sempre à vista. */}
      {upload.status === "STAGED" && warnings.length > 0 ? (
        <Alert
          tone={rows.length ? "warning" : "danger"}
          title={rows.length ? "Avisos da leitura:" : "Nenhuma linha pôde ser lida:"}
          items={warnings}
        />
      ) : null}

      {commit.data && commit.data.failed.length > 0 ? (
        <Alert tone="danger" title={`${commit.data.failed.length} não puderam ser gravadas:`}>
          {commit.data.failed.map((f) => `${f.description} (${f.message})`).join(" · ")}
        </Alert>
      ) : null}

      {committed ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-success-soft text-success [&_svg]:size-6">
              <CheckCircle2 />
            </span>
            <div className="space-y-1">
              <p className="font-display text-display-sm text-foreground">Importação confirmada</p>
              <p className="text-[13.5px] text-muted-foreground">
                {commit.data ? commitSummary(commit.data) : "As linhas deste arquivo já estão em Transações."}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href="/transactions">Ver transações</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/upload">Importar outro arquivo</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {!committed && !reading && rows.length === 0 && upload.status !== "FAILED" ? (
        <EmptyState
          title="Nada para revisar"
          hint={
            warnings.length
              ? "Veja acima por que nenhuma linha entrou. Se o leitor foi corrigido, reprocesse o arquivo."
              : "Este arquivo não gerou transações."
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {warnings.length ? (
                <Button
                  size="sm"
                  loading={reprocess.isPending}
                  onClick={() => reprocess.mutate(id, { onSuccess: () => staged.refetch() })}
                >
                  {reprocess.isPending ? null : <RefreshCw />}
                  Reprocessar
                </Button>
              ) : null}
              <Button asChild variant="secondary" size="sm">
                <Link href="/upload">Voltar para Importar</Link>
              </Button>
            </div>
          }
        />
      ) : null}

      {rows.length > 0 ? (
        <>
          {committed ? null : (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <StatCard label="Linhas lidas" value={rows.length} footnote="do arquivo" />
                <StatCard label="Prontas" value={lists.ready.length} footnote="entram como estão" />
                <StatCard
                  label="Precisam de você"
                  value={<span className={pending ? "text-warning" : undefined}>{pending}</span>}
                  highlight={pending ? "warning" : undefined}
                  footnote={`de ${rows.length} ${rows.length === 1 ? "linha" : "linhas"}`}
                />
                <StatCard label="Transferências internas" value={internal} footnote="não contam como gasto" />
              </div>

              {upload.detectedFormat === "tabular" || upload.detectedFormat === "ofx" ? (
                <Alert tone="brand" title="Layout reconhecido.">
                  Valores lidos de forma determinística — nenhum número passou pela IA.
                </Alert>
              ) : upload.detectedFormat === "pdf-text" ? (
                <Alert tone="brand" title="Lido do texto do extrato.">
                  Sem IA: valores, sinais e datas vêm do PDF e cada dia foi conferido pelo total impresso.
                </Alert>
              ) : upload.detectedFormat === "pdf-ocr" ? (
                <Alert tone="brand" title="Lido da imagem do extrato, sem IA.">
                  O PDF era uma imagem: o texto saiu por OCR e cada valor foi conferido pelo saldo impresso. O que não
                  fechou está marcado para você conferir.
                </Alert>
              ) : upload.detectedFormat === "document" ? (
                <Alert tone="info" title="Extraído pela IA.">
                  Confira datas e valores: em PDF e foto a leitura pode errar. Use o lápis para corrigir.
                </Alert>
              ) : null}
            </>
          )}

          <Tabs
            value={activeTab}
            onValueChange={(v) => {
              setTab(v as TabKey);
              setSelected(new Set());
            }}
          >
            <div className="overflow-x-auto">
              <TabsList className="min-w-max">
                <TabsTrigger value="review" count={pending}>
                  Precisam de revisão
                </TabsTrigger>
                <TabsTrigger value="ready" count={lists.ready.length}>
                  Prontas
                </TabsTrigger>
                <TabsTrigger value="internal" count={internal}>
                  Transferências internas
                </TabsTrigger>
                {lists.duplicate.length ? (
                  <TabsTrigger value="duplicate" count={lists.duplicate.length}>
                    Já em Transações
                  </TabsTrigger>
                ) : null}
                <TabsTrigger value="all" count={rows.length}>
                  Todas
                </TabsTrigger>
              </TabsList>
            </div>

            {selected.size > 0 && !committed ? (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-primary-soft px-4 py-2.5">
                <span className="mr-1 text-[13.5px] font-semibold text-primary-ink">
                  {selected.size} {selected.size === 1 ? "selecionada" : "selecionadas"}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  loading={bulkBusy === "accept"}
                  disabled={bulkBusy !== null}
                  onClick={() => bulkApply("accept", (r) => ({ categoryId: r.categoryId }))}
                >
                  {bulkBusy === "accept" ? null : <Check />}
                  Aceitar
                </Button>
                <MemberSelect
                  members={people}
                  value={null}
                  disabled={bulkBusy !== null}
                  trigger={bulkBusy === "member" ? "Aplicando…" : "Definir responsável"}
                  onChange={(memberId) => bulkApply("member", () => ({ memberId }))}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  loading={bulkBusy === "internal"}
                  disabled={bulkBusy !== null}
                  onClick={() => bulkApply("internal", () => ({ isInternalTransfer: true }))}
                >
                  Marcar como interna
                </Button>
                <Button size="sm" variant="secondary" disabled={bulkBusy !== null} onClick={() => setBulkDelete(true)}>
                  <Trash2 />
                  Excluir
                </Button>
                <Button size="sm" variant="ghost" disabled={bulkBusy !== null} onClick={() => setSelected(new Set())}>
                  Limpar seleção
                </Button>
                <DeleteRowsDialog
                  rows={rows.filter((r) => selected.has(r.id))}
                  uploadId={id}
                  open={bulkDelete}
                  onOpenChange={setBulkDelete}
                  onDeleted={() => setSelected(new Set())}
                />
              </div>
            ) : null}

            {(Object.keys(lists) as TabKey[]).map((key) => (
              <TabsContent key={key} value={key} className="mt-4">
                {lists[key].length === 0 ? (
                  <EmptyState icon={<CheckCircle2 />} title={empties[key].title} hint={empties[key].hint} />
                ) : (
                  <Card className="overflow-hidden">
                    <ReviewTable
                      rows={lists[key]}
                      uploadId={id}
                      categories={cats}
                      members={people}
                      readOnly={committed}
                      reviewedIds={reviewIds}
                      selected={selected}
                      onSelectedChange={setSelected}
                    />
                  </Card>
                )}
              </TabsContent>
            ))}
          </Tabs>

          {committed ? null : (
            <ConfirmBar
              total={rows.length - lists.duplicate.length}
              skipped={lists.duplicate.length}
              pending={pending}
              undecided={undecided.length}
              // linha excluída ainda a caminho do servidor: confirmar agora a gravaria
              loading={commit.isPending || deleting}
              deciding={bulkBusy === "duplicates"}
              onConfirm={() => commit.mutate(undefined)}
              onDecideAll={async (match) => {
                setBulkBusy("duplicates");
                // Cada falha já vira toast no hook; as que deram certo ficam respondidas.
                await Promise.allSettled(undecided.map((r) => bulk.mutateAsync({ id: r.id, data: { match } })));
                setBulkBusy(null);
              }}
              onReviewUndecided={() => {
                setTab("review");
                setSelected(new Set());
              }}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
