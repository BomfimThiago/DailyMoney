"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Landmark, Plus, RefreshCw } from "lucide-react";
import {
  useConnections,
  useCreateConnection,
  useDeleteConnection,
  useEuropeanBanks,
  useStartBankAuthorization,
  useSyncConnection,
  useUpdateConnection,
  type BankConnection,
  type BankProviderName,
} from "@/hooks";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { relativeWhen } from "./format";

const DAY = new Intl.DateTimeFormat("pt-BR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const DAY_MS = 86_400_000;
const isoDay = (iso: string) => iso.slice(0, 10);

/** Países da Enable Banking (Espanha primeiro: onde a família mora). */
const COUNTRIES: { code: string; name: string }[] = [
  { code: "ES", name: "Espanha" },
  { code: "PT", name: "Portugal" },
  { code: "FR", name: "França" },
  { code: "IT", name: "Itália" },
  { code: "DE", name: "Alemanha" },
  { code: "NL", name: "Países Baixos" },
  { code: "BE", name: "Bélgica" },
  { code: "IE", name: "Irlanda" },
  { code: "LU", name: "Luxemburgo" },
  { code: "AT", name: "Áustria" },
  { code: "LT", name: "Lituânia" },
  { code: "LV", name: "Letônia" },
  { code: "EE", name: "Estônia" },
  { code: "FI", name: "Finlândia" },
  { code: "SE", name: "Suécia" },
  { code: "DK", name: "Dinamarca" },
  { code: "NO", name: "Noruega" },
  { code: "PL", name: "Polônia" },
  { code: "GB", name: "Reino Unido" },
];

function subtitle(p: Record<BankProviderName, boolean> | undefined): string {
  if (p?.pluggy && p.enablebanking) {
    return "Meu Pluggy (Brasil) e Enable Banking (Europa): o banco é lido 1 vez por dia e o que chega passa pela revisão.";
  }
  if (p?.enablebanking)
    return "Open Banking pela Enable Banking: o banco é lido 1 vez por dia e o que chega passa pela revisão.";
  return "Open Finance pelo Meu Pluggy: o banco atualiza 1 vez por dia e o que chega passa pela revisão.";
}

/** Bancos conectados (Pluggy, Enable Banking): cada sincronização vira uma importação para revisar. */
export function ConnectedBanks() {
  const q = useConnections();
  const [adding, setAdding] = React.useState(false);
  const connections = q.data?.connections ?? [];
  const providers = q.data?.providers;
  const enabled = Boolean(providers?.pluggy || providers?.enablebanking);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-display-sm text-foreground">Bancos conectados</h2>
          <p className="text-meta text-subtle">{subtitle(providers)}</p>
        </div>
        {enabled ? (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            <Plus />
            Conectar banco
          </Button>
        ) : null}
      </div>

      {q.isLoading ? (
        <Skeleton className="h-[88px] rounded-2xl" />
      ) : q.isError ? (
        <ErrorState title="Não deu para carregar os bancos conectados" error={q.error} onRetry={() => q.refetch()} />
      ) : !enabled ? (
        <Alert tone="info" title="Sincronização de banco desligada.">
          Para bancos brasileiros, o servidor precisa de PLUGGY_APP_ID e PLUGGY_APP_SECRET (Client ID e Secret da sua
          aplicação no Dashboard da Pluggy). Para europeus, de ENABLE_BANKING_APP_ID e da chave da aplicação
          (ENABLE_BANKING_PRIVATE_KEY ou ENABLE_BANKING_KEY_FILE).
        </Alert>
      ) : connections.length === 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-[13.5px] text-muted-foreground">
            Nenhum banco conectado. Conecte para as transações chegarem sem baixar extrato.
          </p>
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus />
            Conectar banco
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {connections.map((c) => (
            <ConnectionRow key={c.id} connection={c} />
          ))}
        </div>
      )}

      {providers ? <AddConnectionDialog open={adding} onOpenChange={setAdding} providers={providers} /> : null}
    </section>
  );
}

function accountsLine(c: BankConnection): string | null {
  if (!c.accounts.length) return null;
  return c.accounts
    .map((a) => [a.label, a.currency, a.last4 ? `••${a.last4}` : null].filter(Boolean).join(" "))
    .join(", ");
}

function ConnectionRow({ connection: c }: { connection: BankConnection }) {
  const sync = useSyncConnection();
  const reauthorize = useStartBankAuthorization();
  const [editing, setEditing] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const expiresInDays = c.consentExpiresAt
    ? Math.ceil((new Date(c.consentExpiresAt).getTime() - Date.now()) / DAY_MS)
    : null;
  const pending = c.pendingReviews.reduce((s, p) => s + p.rows, 0);
  const european = c.provider === "enablebanking";
  // Autorizar de novo: perto de vencer, vencida, ou a última leitura falhou por isso.
  const needsConsent =
    european && ((expiresInDays !== null && expiresInDays <= 30) || /autoriz/i.test(c.lastError ?? ""));

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-[18px]">
          <Landmark />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-foreground">{c.bank}</span>
            {pending ? <Badge variant="warning">{pending} para revisar</Badge> : null}
            {expiresInDays !== null && expiresInDays <= 30 ? (
              <Badge variant={expiresInDays <= 0 ? "danger" : "warning"}>
                {expiresInDays <= 0
                  ? "autorização vencida"
                  : `autorização vence em ${expiresInDays} ${expiresInDays === 1 ? "dia" : "dias"}`}
              </Badge>
            ) : null}
          </span>
          <span className="text-meta text-subtle">
            {[
              c.lastSyncAt ? `sincronizado ${relativeWhen(c.lastSyncAt)}` : "ainda não sincronizado",
              `transações desde ${DAY.format(new Date(c.syncFrom))}`,
              c.consentExpiresAt && (expiresInDays ?? 0) > 30
                ? `autorizado até ${DAY.format(new Date(c.consentExpiresAt))}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {accountsLine(c) ? <span className="text-meta text-subtle">{accountsLine(c)}</span> : null}
          {c.lastError ? (
            <span role="alert" className="mt-1 flex items-start gap-1.5 text-meta font-medium text-destructive">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              <span>{c.lastError}</span>
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {c.pendingReviews.map((p, i) => (
            <Button key={p.uploadId} asChild size="sm" variant={i === 0 ? "default" : "secondary"}>
              <Link href={`/review/${p.uploadId}`}>
                Revisar {c.pendingReviews.length > 1 ? p.filename.replace(`${c.bank} · `, "").toLowerCase() : ""}
              </Link>
            </Button>
          ))}
          {needsConsent ? (
            <Button
              size="sm"
              loading={reauthorize.isPending}
              onClick={() => reauthorize.mutate({ connectionId: c.id })}
            >
              Autorizar de novo
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={c.pendingReviews.length || needsConsent ? "secondary" : "default"}
            loading={sync.isPending}
            onClick={() => sync.mutate(c.id)}
          >
            {sync.isPending ? null : <RefreshCw />}
            Sincronizar agora
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Editar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:bg-destructive-soft hover:text-destructive"
            onClick={() => setRemoving(true)}
          >
            Desconectar
          </Button>
        </div>
      </div>

      <EditConnectionDialog connection={c} open={editing} onOpenChange={setEditing} />
      <RemoveConnectionDialog connection={c} open={removing} onOpenChange={setRemoving} />
    </Card>
  );
}

function AddConnectionDialog({
  open,
  onOpenChange,
  providers,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  providers: Record<BankProviderName, boolean>;
}) {
  const both = providers.pluggy && providers.enablebanking;
  const [region, setRegion] = React.useState<BankProviderName>(providers.pluggy ? "pluggy" : "enablebanking");
  React.useEffect(() => {
    if (open) setRegion(providers.pluggy ? "pluggy" : "enablebanking");
  }, [open, providers.pluggy]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {both ? (
          <Segmented
            aria-label="Onde fica o banco"
            className="mb-4 self-start"
            size="sm"
            value={region}
            onValueChange={setRegion}
            options={[
              { value: "pluggy", label: "Brasil" },
              { value: "enablebanking", label: "Europa" },
            ]}
          />
        ) : null}
        {region === "pluggy" ? (
          <PluggyForm open={open} onDone={() => onOpenChange(false)} />
        ) : (
          <EuropeForm open={open} />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Banco europeu: escolhe país e banco e vai ao banco autorizar; volta em /connections/callback. */
function EuropeForm({ open }: { open: boolean }) {
  const start = useStartBankAuthorization();
  const [country, setCountry] = React.useState("ES");
  const [bank, setBank] = React.useState<string | null>(null);
  const [syncFrom, setSyncFrom] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const banks = useEuropeanBanks(country);

  React.useEffect(() => {
    if (!open) return;
    setCountry("ES");
    setBank(null);
    setSyncFrom("");
    setSubmitted(false);
  }, [open]);

  const options = React.useMemo(
    () =>
      (banks.data ?? []).map((b) => ({
        value: b.name,
        label: b.name,
        hint: b.beta ? "beta" : undefined,
      })),
    [banks.data],
  );
  const bankError = submitted && !bank ? "Escolha o banco." : undefined;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!bank) return;
    start.mutate({ country, bank, syncFrom: syncFrom || undefined });
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Conectar banco europeu</DialogTitle>
        <DialogDescription>
          Você vai para a página do banco, entra como no app dele e autoriza a leitura das contas. Depois volta para cá.
          A autorização vale até 180 dias; perto de vencer, o app pede para renovar.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-5">
        <Field label="País" htmlFor="eu-country">
          <Select
            id="eu-country"
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setBank(null);
            }}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Banco" htmlFor="eu-bank" error={bankError}>
          {banks.isError ? (
            <Alert
              tone="danger"
              title="Não deu para carregar os bancos."
              action={
                <Button type="button" size="sm" variant="secondary" onClick={() => banks.refetch()}>
                  Tentar de novo
                </Button>
              }
            >
              {banks.error.message}
            </Alert>
          ) : (
            <Combobox
              id="eu-bank"
              label="Banco"
              options={options}
              value={bank}
              onValueChange={setBank}
              disabled={banks.isLoading}
              invalid={!!bankError}
              placeholder={banks.isLoading ? "Carregando bancos…" : "Escolha o banco"}
              searchPlaceholder="Buscar banco…"
              emptyText="Nenhum banco com esse nome neste país"
            />
          )}
        </Field>
        <Field
          label="Trazer transações a partir de"
          htmlFor="eu-from"
          hint="Em branco: o dia seguinte à última transação desse banco que já está no app. Muitos bancos só entregam os últimos 90 dias."
        >
          <Input id="eu-from" type="date" value={syncFrom} onChange={(e) => setSyncFrom(e.target.value)} />
        </Field>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" loading={start.isPending}>
          Ir para o banco
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Banco brasileiro (Pluggy): o usuário autoriza no meu.pluggy.ai e cola o id da conexão. */
function PluggyForm({ open, onDone }: { open: boolean; onDone: () => void }) {
  const create = useCreateConnection();
  const [bank, setBank] = React.useState("");
  const [itemId, setItemId] = React.useState("");
  const [syncFrom, setSyncFrom] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setBank("");
    setItemId("");
    setSyncFrom("");
    setSubmitted(false);
  }, [open]);

  const validId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId.trim());
  const bankError = submitted && !bank.trim() ? "Informe o banco." : undefined;
  const idError = submitted && !validId ? "Cole o id inteiro, no formato a1b2c3d4-e5f6-…" : undefined;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!bank.trim() || !validId) return;
    create.mutate(
      {
        bank: bank.trim(),
        itemId: itemId.trim(),
        syncFrom: syncFrom || undefined,
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Conectar banco brasileiro</DialogTitle>
        <DialogDescription>
          Autorize o banco no meu.pluggy.ai. Depois, no Dashboard da Pluggy, abra Applications › sua aplicação › Demo ›
          Connect Account › MeuPluggy e copie o id que aparece em Connected Items.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-5">
        <Field label="Banco" htmlFor="conn-bank" error={bankError}>
          <Input
            id="conn-bank"
            autoFocus
            autoComplete="off"
            placeholder="Nubank"
            value={bank}
            invalid={!!bankError}
            onChange={(e) => setBank(e.target.value)}
          />
        </Field>
        <Field label="Id da conexão" htmlFor="conn-item" error={idError}>
          <Input
            id="conn-item"
            autoComplete="off"
            spellCheck={false}
            placeholder="a1b2c3d4-e5f6-7890-abcd-1234567890ab"
            value={itemId}
            invalid={!!idError}
            onChange={(e) => setItemId(e.target.value)}
          />
        </Field>
        <Field
          label="Trazer transações a partir de"
          htmlFor="conn-from"
          hint="Em branco: o dia seguinte à última transação desse banco que já está no app, para não repetir o que veio por extrato."
        >
          <Input id="conn-from" type="date" value={syncFrom} onChange={(e) => setSyncFrom(e.target.value)} />
        </Field>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" loading={create.isPending}>
          Conectar
        </Button>
      </DialogFooter>
    </form>
  );
}

function EditConnectionDialog({
  connection: c,
  open,
  onOpenChange,
}: {
  connection: BankConnection;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const update = useUpdateConnection();
  const [bank, setBank] = React.useState(c.bank);
  const [syncFrom, setSyncFrom] = React.useState(isoDay(c.syncFrom));

  React.useEffect(() => {
    if (!open) return;
    setBank(c.bank);
    setSyncFrom(isoDay(c.syncFrom));
  }, [open, c.bank, c.syncFrom]);

  const bankError = !bank.trim() ? "Informe o banco." : undefined;
  const fromError = !syncFrom ? "Escolha uma data." : undefined;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (bankError || fromError) return;
    update.mutate({ id: c.id, bank: bank.trim(), syncFrom }, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Editar conexão</DialogTitle>
            <DialogDescription>Vale a partir da próxima sincronização.</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            <Field label="Banco" htmlFor="edit-bank" error={bankError}>
              <Input id="edit-bank" value={bank} invalid={!!bankError} onChange={(e) => setBank(e.target.value)} />
            </Field>
            <Field
              label="Trazer transações a partir de"
              htmlFor="edit-from"
              error={fromError}
              hint="Antes desta data, nada é lido do banco nem removido."
            >
              <Input
                id="edit-from"
                type="date"
                value={syncFrom}
                invalid={!!fromError}
                onChange={(e) => setSyncFrom(e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={update.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RemoveConnectionDialog({
  connection: c,
  open,
  onOpenChange,
}: {
  connection: BankConnection;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const remove = useDeleteConnection();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desconectar {c.bank}?</DialogTitle>
          <DialogDescription>
            As transações já confirmadas continuam no app
            {c.pendingReviews.length ? "; as sincronizações ainda em revisão são descartadas" : ""}.{" "}
            {c.provider === "enablebanking"
              ? "A autorização no banco é encerrada."
              : "A autorização no Meu Pluggy continua até você removê-la lá."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancelar</Button>
          </DialogClose>
          <Button
            variant="destructive"
            loading={remove.isPending}
            onClick={() => remove.mutate(c.id, { onSuccess: () => onOpenChange(false) })}
          >
            Desconectar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
