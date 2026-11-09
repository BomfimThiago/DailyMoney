"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  FileImage,
  FileSpreadsheet,
  FileText,
  Landmark,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useDeleteUpload, useReprocessUpload, useUploads, type Upload } from "@/hooks";
import { readWarningLines } from "@/lib/ingest/read-warnings";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { fileExt, fileSize, fullWhen, relativeWhen } from "./format";

const isBusy = (u: Upload) => u.status === "PENDING" || u.status === "PARSING";
const needsAction = (u: Upload) => u.status === "STAGED" || u.status === "FAILED";

/** Lista das importações (decisão: accordion, um card por arquivo). */
export function RecentUploads() {
  const uploads = useUploads();
  const data = uploads.data;

  // Abertos: por padrão os que pedem ação (revisar / falhou). Depois que o
  // usuário mexe, respeitamos a escolha, mas novas falhas/revisões abrem sozinhas.
  const [open, setOpen] = React.useState<string[] | null>(null);
  const seen = React.useRef<Set<string> | null>(null);
  React.useEffect(() => {
    if (!data) return;
    const ids = data.filter(needsAction).map((u) => u.id);
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const known = seen.current;
    const fresh = ids.filter((id) => !known.has(id));
    fresh.forEach((id) => known.add(id));
    if (fresh.length) setOpen((prev) => (prev === null ? prev : Array.from(new Set([...prev, ...fresh]))));
  }, [data]);

  const failed = data?.filter((u) => u.status === "FAILED").length ?? 0;
  const toReview = data?.filter((u) => u.status === "STAGED").length ?? 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-display-sm text-foreground">Importações recentes</h2>
          <p className="text-meta text-subtle">Abra uma importação para ver os detalhes e as ações.</p>
        </div>
        <div className="flex gap-1.5">
          {failed ? <Badge variant="danger">{failed} falhou</Badge> : null}
          {toReview ? <Badge variant="warning">{toReview} para revisar</Badge> : null}
        </div>
      </div>

      {uploads.isLoading ? (
        <div className="space-y-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-2xl" />
          ))}
        </div>
      ) : uploads.isError ? (
        <ErrorState
          title="Não deu para carregar as importações"
          error={uploads.error}
          onRetry={() => uploads.refetch()}
        />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="Nenhuma importação ainda"
          hint="Envie um extrato ou recibo acima para começar."
        />
      ) : (
        <Accordion
          type="multiple"
          variant="card"
          value={open ?? data.filter(needsAction).map((u) => u.id)}
          onValueChange={setOpen}
        >
          {data.map((u) => (
            <UploadItem key={u.id} upload={u} />
          ))}
        </Accordion>
      )}
    </section>
  );
}

const isSynced = (u: Upload) => u.detectedFormat === "pluggy" || u.detectedFormat === "enablebanking";

function FileIcon({ upload }: { upload: Upload }) {
  if (isSynced(upload)) return <Landmark />;
  const ext = fileExt(upload.filename);
  if (upload.mime.startsWith("image/")) return <FileImage />;
  if (
    upload.detectedFormat === "tabular" ||
    upload.detectedFormat === "ofx" ||
    ["CSV", "TSV", "XLS", "XLSX", "OFX"].includes(ext)
  )
    return <FileSpreadsheet />;
  return <FileText />;
}

function StatusBadge({ upload }: { upload: Upload }) {
  switch (upload.status) {
    case "STAGED":
      // Lido mas sem nenhuma linha: não há o que revisar — mostrar neutro.
      if (!upload._count?.staged) return <Badge>nenhuma linha lida</Badge>;
      return (
        <Badge variant="warning">
          <AlertTriangle />
          {upload._count?.staged ?? 0} para revisar
        </Badge>
      );
    case "PENDING":
    case "PARSING":
      return (
        <Badge variant="info">
          <Loader2 className="animate-spin" />
          lendo…
        </Badge>
      );
    case "FAILED":
      return (
        <Badge variant="danger">
          <AlertTriangle />
          falhou
        </Badge>
      );
    case "COMMITTED":
      return (
        <Badge variant="success">
          <CheckCircle2 />
          confirmado
        </Badge>
      );
  }
}

function summary(u: Upload): string {
  const staged = u._count?.staged ?? 0;
  const committed = u._count?.transactions ?? 0;
  switch (u.status) {
    case "PENDING":
    case "PARSING":
      return u.detectedFormat === "document" ? "IA extraindo as linhas…" : "lendo o arquivo…";
    case "STAGED":
      return `${staged} ${staged === 1 ? "linha lida" : "linhas lidas"}`;
    case "COMMITTED":
      return `${committed} ${committed === 1 ? "transação confirmada" : "transações confirmadas"}`;
    case "FAILED":
      return "não deu para ler";
  }
}

function formatLabel(u: Upload): string {
  if (u.detectedFormat === "tabular") return "Planilha — layout aprendido, sem IA nos números";
  if (u.detectedFormat === "ofx") return "OFX — lido direto do arquivo, sem IA";
  if (u.detectedFormat === "pluggy") return "Direto do banco (Open Finance, Pluggy), sem IA";
  if (u.detectedFormat === "enablebanking") return "Direto do banco (Open Banking, Enable Banking), sem IA";
  if (u.detectedFormat === "pdf-text") return "PDF — lido do texto e conferido pelos totais, sem IA";
  if (u.detectedFormat === "pdf-ocr") return "PDF de imagem — lido por OCR e conferido pelo saldo, sem IA";
  if (u.detectedFormat === "document") return "PDF ou foto — extraído pela IA";
  if (u.detectedFormat === "unsupported") return "Formato não suportado";
  return "Ainda não identificado";
}

function UploadItem({ upload: u }: { upload: Upload }) {
  const reprocess = useReprocessUpload();
  const remove = useDeleteUpload();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const busy = isBusy(u);
  const committedCount = u._count?.transactions ?? 0;
  const synced = isSynced(u);
  const ext = synced ? "" : fileExt(u.filename);
  // Avisos de uma leitura que deu certo (linhas descartadas, saldo que não fecha…).
  const warnings = u.status === "FAILED" ? [] : readWarningLines(u.error);

  return (
    <AccordionItem value={u.id}>
      <AccordionTrigger aside={<StatusBadge upload={u} />}>
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-[18px]">
          <FileIcon upload={u} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-foreground">{u.filename}</span>
            {ext ? <Badge variant="outline">{ext}</Badge> : null}
          </span>
          <span className="truncate text-meta font-normal text-subtle">
            {[u.bank ?? "Banco não identificado", relativeWhen(u.createdAt), summary(u)].join(" · ")}
          </span>
          {u.status === "FAILED" && u.error ? (
            <span className="flex items-start gap-1.5 text-meta font-medium text-destructive">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              <span className="line-clamp-2">{u.error}</span>
            </span>
          ) : warnings.length ? (
            <span className="flex items-start gap-1.5 text-meta font-medium text-warning">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              <span className="line-clamp-1">
                {warnings.length === 1 ? warnings[0] : `${warnings.length} avisos da leitura: ${warnings[0]}`}
              </span>
            </span>
          ) : null}
          {busy ? <Progress tone="info" label={`Lendo ${u.filename}`} className="mt-1.5 max-w-xs" /> : null}
        </span>
      </AccordionTrigger>

      <AccordionContent>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Fact label="Linhas em revisão" value={u._count?.staged ?? 0} />
          <Fact label="Transações confirmadas" value={u._count?.transactions ?? 0} />
          <Fact label="Leitura" value={formatLabel(u)} />
          <Fact
            label={synced ? "Sincronizado" : "Enviado"}
            value={synced ? fullWhen(u.createdAt) : `${fullWhen(u.createdAt)} · ${fileSize(u.sizeBytes)}`}
          />
        </dl>

        {u.status !== "FAILED" && warnings.length ? (
          <Alert tone="warning" title="Avisos da leitura:" items={warnings} className="mt-4" />
        ) : null}

        {u.status === "FAILED" && u.error ? (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-destructive-soft px-3 py-2 text-[13px] font-medium text-destructive"
          >
            {u.error}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {u.status === "STAGED" ? (
            <Button asChild size="sm">
              <Link href={`/review/${u.id}`}>Revisar</Link>
            </Button>
          ) : null}
          {u.status === "COMMITTED" ? (
            <>
              <Button asChild size="sm" variant="secondary">
                <Link href="/transactions">Ver transações</Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={`/review/${u.id}`}>Ver linhas importadas</Link>
              </Button>
            </>
          ) : null}
          {/* Sincronização não tem arquivo para reler: sincroniza-se de novo pelo banco. */}
          {synced ? null : (
            <Button
              size="sm"
              variant={u.status === "FAILED" ? "default" : "secondary"}
              disabled={busy}
              loading={reprocess.isPending}
              onClick={() => reprocess.mutate(u.id)}
            >
              {reprocess.isPending ? null : <RefreshCw />}
              Reprocessar
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive-soft hover:text-destructive"
            disabled={busy}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 />
            Excluir
          </Button>
        </div>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir importação?</DialogTitle>
              <DialogDescription>
                {committedCount > 0 ? (
                  <>
                    “{u.filename}” gravou {committedCount} {committedCount === 1 ? "transação" : "transações"}. Você
                    pode apagar tudo, ou apagar só a importação e manter as transações em Transações.
                  </>
                ) : (
                  <>“{u.filename}” e as linhas ainda em revisão serão apagadas.</>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex-wrap">
              <DialogClose asChild>
                <Button variant="secondary">Cancelar</Button>
              </DialogClose>
              {committedCount > 0 ? (
                <Button
                  variant="secondary"
                  loading={remove.isPending && remove.variables?.withTransactions === false}
                  disabled={remove.isPending}
                  onClick={() =>
                    remove.mutate({ id: u.id, withTransactions: false }, { onSuccess: () => setConfirmOpen(false) })
                  }
                >
                  Só a importação
                </Button>
              ) : null}
              <Button
                variant="destructive"
                loading={remove.isPending && remove.variables?.withTransactions !== false}
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(
                    { id: u.id, withTransactions: committedCount > 0 },
                    { onSuccess: () => setConfirmOpen(false) },
                  )
                }
              >
                {committedCount > 0
                  ? `Excluir com ${committedCount} ${committedCount === 1 ? "transação" : "transações"}`
                  : "Excluir importação"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AccordionContent>
    </AccordionItem>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-0.5">
      <dt className="text-meta text-subtle">{label}</dt>
      <dd className="text-[13px] font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
