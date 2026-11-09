"use client";

import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useChangePassword, useSettings, useUpdateSettings } from "@/hooks";
import { MONTH_START_MAX, periodBounds, periodKeyOf, localIso, shortDate } from "@/lib/period";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/states";

const MIN_PASSWORD = 8;

const DAYS = Array.from({ length: MONTH_START_MAX }, (_, i) => i + 1);

/** "novembro vai de 27 out a 26 nov": o mês de hoje com o dia de início escolhido. */
function preview(startDay: number, today = new Date()): string {
  const key = periodKeyOf(localIso(today), startDay);
  const b = periodBounds(key, startDay);
  const name = format(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1), "MMMM", { locale: ptBR });
  return `Hoje é ${name}: de ${shortDate(b.start)} a ${shortDate(b.end)}.`;
}

/**
 * Mês financeiro: o dia em que o "mês" do app começa (o dia do salário). Vale para todas as
 * telas: Resumo, Transações, gráficos e comparações com o mês anterior.
 */
function MonthStartCard() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const saved = settings.data?.monthStartDay;
  const [day, setDay] = React.useState<number | null>(null);
  const value = day ?? saved ?? 1;
  const dirty = saved !== undefined && value !== saved;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    update.mutate({ monthStartDay: value }, { onSuccess: () => setDay(null) });
  }

  return (
    <Card>
      <form onSubmit={submit} noValidate>
        <CardHeader>
          <CardTitle>Início do mês</CardTitle>
          <CardDescription>
            Para o mês seguir o salário: começando no dia 27, novembro vai de 27 de outubro a 26 de novembro e leva o
            nome do mês em que termina. Vale para todas as telas.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : settings.isError ? (
            <ErrorState
              error={settings.error}
              title="Não deu para carregar o início do mês"
              onRetry={() => settings.refetch()}
            />
          ) : (
            <Field label="O mês começa no dia" htmlFor="month-start" hint={preview(value)}>
              <Select id="month-start" value={value} onChange={(e) => setDay(Number(e.target.value))}>
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d === 1 ? "1 (mês do calendário)" : d}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" loading={update.isPending} disabled={!dirty}>
            Salvar início do mês
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function AccountPage() {
  const change = useChangePassword();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  const errors = {
    current: !currentPassword ? "Informe a senha atual." : undefined,
    next: !newPassword
      ? "Informe a nova senha."
      : newPassword.length < MIN_PASSWORD
        ? `A nova senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`
        : newPassword === currentPassword
          ? "A nova senha precisa ser diferente da atual."
          : undefined,
    confirm: confirm !== newPassword ? "As senhas não conferem." : undefined,
  };
  const shown = submitted ? errors : { current: undefined, next: undefined, confirm: undefined };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (errors.current || errors.next || errors.confirm) return;
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setNewPassword("");
          setConfirm("");
          setSubmitted(false);
        },
      },
    );
  }

  return (
    <div>
      <PageHeader title="Configurações" description="O mês da família e a sua senha." />

      <div className="grid max-w-5xl items-start gap-6 lg:grid-cols-2">
        <MonthStartCard />

        <Card>
          <form onSubmit={submit} noValidate>
            <CardHeader>
              <CardTitle>Trocar senha</CardTitle>
              <CardDescription>Escolha uma nova senha segura.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Senha atual" htmlFor="current-password" error={shown.current}>
                <Input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  invalid={!!shown.current}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                />
              </Field>
              <Field
                label="Nova senha"
                htmlFor="new-password"
                hint={`Mínimo de ${MIN_PASSWORD} caracteres.`}
                error={shown.next}
              >
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  invalid={!!shown.next}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </Field>
              <Field label="Confirmar nova senha" htmlFor="confirm-password" error={shown.confirm}>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  invalid={!!shown.confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </Field>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit" loading={change.isPending}>
                Salvar nova senha
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
