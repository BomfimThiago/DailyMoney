"use client";

import * as React from "react";
import { RefreshCw, AlertTriangle, ArrowLeftRight, Check, CheckCircle2, Copy, Pencil, Trash2 } from "lucide-react";
import {
  useCreateCategory,
  usePatchStaged,
  type Category,
  type Member,
  type StagedPatch,
  type StagedTransaction,
} from "@/hooks";
import { CategoryPicker } from "@/components/finance/category-picker";
import { ConfidenceMeter } from "@/components/finance/confidence-meter";
import { Money } from "@/components/finance/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Tooltip } from "@/components/ui/tooltip";
import { DeleteRowsDialog } from "./delete-rows-dialog";
import { EditRowDialog } from "./edit-row-dialog";
import { MemberSelect } from "./member-select";

const DAY = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
export const formatDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DAY.format(d);
};

export interface ReviewTableProps {
  rows: StagedTransaction[];
  uploadId: string;
  categories: Category[];
  members: Member[];
  /** Importação já confirmada: só leitura. */
  readOnly: boolean;
  /** Linhas que estavam em revisão nesta visita (continuam visíveis como "Revisada"). */
  reviewedIds: Set<string>;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
}

export function ReviewTable({
  rows,
  uploadId,
  categories,
  members,
  readOnly,
  reviewedIds,
  selected,
  onSelectedChange,
}: ReviewTableProps) {
  const selectedHere = rows.filter((r) => selected.has(r.id)).length;
  const all = rows.length > 0 && selectedHere === rows.length ? true : selectedHere > 0 ? "indeterminate" : false;

  return (
    <Table>
      <THead>
        <TR className="hover:bg-transparent">
          {readOnly ? null : (
            <TH className="w-10">
              <Checkbox
                aria-label="Selecionar todas"
                checked={all}
                onCheckedChange={() => onSelectedChange(all === true ? new Set() : new Set(rows.map((r) => r.id)))}
              />
            </TH>
          )}
          <TH className="w-16">Data</TH>
          <TH>Descrição no extrato · motivo</TH>
          <TH>Categoria</TH>
          <TH>Responsável</TH>
          <TH>
            {/* Botão: a explicação abre também pelo teclado (foco), não só com o mouse. */}
            <Tooltip content="Transferência entre contas suas: não conta como gasto nem entrada.">
              <button
                type="button"
                className="cursor-help rounded-sm underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Interna
                <span className="sr-only"> (transferência entre contas suas, fora dos totais)</span>
              </button>
            </Tooltip>
          </TH>
          <TH className="text-right">Valor</TH>
          {readOnly ? null : (
            <TH className="w-32">
              <span className="sr-only">Ações</span>
            </TH>
          )}
        </TR>
      </THead>
      <TBody>
        {rows.map((r) => (
          <ReviewRow
            key={r.id}
            row={r}
            uploadId={uploadId}
            categories={categories}
            members={members}
            readOnly={readOnly}
            reviewed={!r.needsReview && reviewedIds.has(r.id)}
            selected={selected.has(r.id)}
            onSelect={(on) => {
              const next = new Set(selected);
              if (on) next.add(r.id);
              else next.delete(r.id);
              onSelectedChange(next);
            }}
          />
        ))}
      </TBody>
    </Table>
  );
}

function ReviewRow({
  row,
  uploadId,
  categories,
  members,
  readOnly,
  reviewed,
  selected,
  onSelect,
}: {
  row: StagedTransaction;
  uploadId: string;
  categories: Category[];
  members: Member[];
  readOnly: boolean;
  reviewed: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
}) {
  const patch = usePatchStaged(uploadId);
  const accept = usePatchStaged(uploadId);
  const createCategory = useCreateCategory();
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const update = (data: StagedPatch) => patch.mutate({ id: row.id, data });
  const isTransfer = row.isInternalTransfer || row.type === "TRANSFER";
  const kind = row.type === "INCOME" ? "INCOME" : "EXPENSE";
  const primary = row.merchantRaw ?? row.description;
  const secondary = row.merchantRaw && row.merchantRaw !== row.description ? row.description : null;

  return (
    <TR state={selected ? "selected" : row.needsReview ? "review" : undefined}>
      {readOnly ? null : (
        <TD>
          <Checkbox
            aria-label={`Selecionar ${primary}`}
            checked={selected}
            onCheckedChange={(v) => onSelect(v === true)}
          />
        </TD>
      )}
      <TD className="whitespace-nowrap tabular-nums text-muted-foreground">{formatDay(row.date)}</TD>
      <TD>
        <div className="min-w-[220px] max-w-[380px]">
          <div className="truncate font-mono text-[12.5px] font-semibold text-foreground" title={primary}>
            {primary}
          </div>
          {secondary ? (
            <div className="truncate text-meta text-muted-foreground" title={secondary}>
              {secondary}
            </div>
          ) : null}
          {row.duplicateOfId && (row.match === "DUPLICATE" || row.match === "NEW") ? (
            <DuplicateNote
              row={row}
              readOnly={readOnly}
              onChange={(match) => update({ match })}
              busy={patch.isPending}
            />
          ) : row.needsReview ? (
            <div className="mt-1 flex items-center gap-1.5 text-meta text-warning">
              <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
              <span>{row.reviewReason ?? "Confira esta linha"}</span>
            </div>
          ) : reviewed ? (
            <div className="mt-1 flex items-center gap-1.5 text-meta text-success">
              <CheckCircle2 aria-hidden className="size-3.5 shrink-0" />
              Revisada
            </div>
          ) : row.match === "SAME" ? (
            <div className="mt-1 flex items-center gap-1.5 text-meta text-subtle">
              <CheckCircle2 aria-hidden className="size-3.5 shrink-0" />
              Já importada, sem mudanças
            </div>
          ) : row.match === "UPDATE" ? (
            <div className="mt-1 flex items-center gap-1.5 text-meta text-transfer">
              <RefreshCw aria-hidden className="size-3.5 shrink-0" />
              Já importada: será corrigida
            </div>
          ) : null}
          {row.confidence < 1 ? <ConfidenceMeter value={row.confidence} className="mt-1" /> : null}
        </div>
      </TD>
      <TD>
        {isTransfer ? (
          <Badge variant="info">
            <ArrowLeftRight />
            Transferência
          </Badge>
        ) : (
          <CategoryPicker
            appearance="pill"
            categories={categories}
            kind={kind}
            value={row.categoryId}
            suggested={row.needsReview}
            disabled={readOnly}
            onChange={(categoryId) => update({ categoryId })}
            onCreate={(name) =>
              createCategory.mutate({ name, kind }, { onSuccess: (d) => update({ categoryId: d.category.id }) })
            }
          />
        )}
      </TD>
      <TD>
        <MemberSelect
          members={members}
          value={row.memberId}
          disabled={readOnly}
          onChange={(memberId) => update({ memberId })}
        />
      </TD>
      <TD>
        <Switch
          aria-label={`Transferência interna: ${primary}`}
          checked={row.isInternalTransfer}
          disabled={readOnly}
          onCheckedChange={(isInternalTransfer) => update({ isInternalTransfer })}
        />
      </TD>
      <TD className="text-right">
        <Money
          value={row.baseAmount}
          currency={row.baseCurrency}
          kind={row.isInternalTransfer ? "TRANSFER" : row.type}
        />
      </TD>
      {readOnly ? null : (
        <TD>
          <div className="flex justify-end gap-1.5">
            <Tooltip content="Corrigir data, descrição, tipo ou valor">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Corrigir ${primary}`}
                onClick={() => setEditing(true)}
              >
                <Pencil />
              </Button>
            </Tooltip>
            <Tooltip content="Excluir: não vai para Transações">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Excluir ${primary}`}
                onClick={() => setDeleting(true)}
              >
                <Trash2 />
              </Button>
            </Tooltip>
            {row.needsReview ? (
              <Tooltip content="Aceitar como está">
                <Button
                  size="icon-sm"
                  aria-label={`Aceitar ${primary}`}
                  loading={accept.isPending}
                  onClick={() => accept.mutate({ id: row.id, data: { categoryId: row.categoryId } })}
                >
                  {accept.isPending ? null : <Check />}
                </Button>
              </Tooltip>
            ) : null}
          </div>
          <EditRowDialog
            row={row}
            uploadId={uploadId}
            categories={categories}
            open={editing}
            onOpenChange={setEditing}
          />
          <DeleteRowsDialog rows={[row]} uploadId={uploadId} open={deleting} onOpenChange={setDeleting} />
        </TD>
      )}
    </TR>
  );
}

/**
 * Linha que outra fonte (outro extrato ou o banco conectado) já pôs em Transações.
 * DUPLICATE: não entra, e a de lá fica como está. NEW: só o valor bateu (o dia não
 * fechou), então o usuário decide. Os dois lados se desfazem com um clique.
 */
function DuplicateNote({
  row,
  readOnly,
  busy,
  onChange,
}: {
  row: StagedTransaction;
  readOnly: boolean;
  busy: boolean;
  onChange: (match: "NEW" | "DUPLICATE") => void;
}) {
  const other = row.reviewReason?.replace(/^(Já está|Pode já estar) em Transações: /, "") ?? "outra transação";
  const action = (label: string, match: "NEW" | "DUPLICATE") =>
    readOnly ? null : (
      <Button
        variant="link"
        size="sm"
        className="ml-1 h-auto px-0 align-baseline text-meta font-semibold"
        disabled={busy}
        onClick={() => onChange(match)}
      >
        {label}
      </Button>
    );

  if (row.match === "DUPLICATE") {
    return (
      <div className="mt-1 flex items-start gap-1.5 text-meta text-subtle">
        <Copy aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span className="min-w-0">
          Já em Transações como {other}. Não entra.
          {action("Importar mesmo assim", "NEW")}
        </span>
      </div>
    );
  }
  if (row.needsReview) {
    return (
      <div className="mt-1 flex items-start gap-1.5 text-meta text-warning">
        <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span className="min-w-0">
          Pode ser {other}, que já está em Transações.
          {action("É a mesma", "DUPLICATE")}
        </span>
      </div>
    );
  }
  return (
    <div className="mt-1 flex items-start gap-1.5 text-meta text-subtle">
      <CheckCircle2 aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0">
        Entra como nova (não é {other}).
        {action("É a mesma", "DUPLICATE")}
      </span>
    </div>
  );
}
