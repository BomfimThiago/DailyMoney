"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useResetPassword } from "@/hooks";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { AuthCard, AuthLink } from "../login/_components/auth-card";

const MIN_PASSWORD = 8;

export default function ResetPage() {
  return (
    <React.Suspense fallback={null}>
      <ResetForm />
    </React.Suspense>
  );
}

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const reset = useResetPassword();
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  const passwordError =
    submitted && password.length < MIN_PASSWORD ? `Use pelo menos ${MIN_PASSWORD} caracteres.` : undefined;
  const confirmError = submitted && confirm !== password ? "As senhas não conferem." : undefined;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (password.length < MIN_PASSWORD || confirm !== password) return;
    reset.mutate({ token, password });
  }

  if (!token) {
    return (
      <AuthCard title="Nova senha" footer={<AuthLink href="/login">Voltar ao login</AuthLink>}>
        <div className="space-y-4">
          <Alert tone="danger" title="Link inválido.">
            O token de redefinição está ausente ou incompleto.
          </Alert>
          <Button asChild size="lg" className="w-full">
            <Link href="/forgot">Solicitar novo link</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (reset.isSuccess) {
    return (
      <AuthCard title="Senha redefinida" description="Sua senha foi alterada.">
        <div className="space-y-4">
          <Alert tone="success" title="Pronto.">
            Entre novamente com a nova senha.
          </Alert>
          <Button asChild size="lg" className="w-full">
            <Link href="/login">Ir para o login</Link>
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Nova senha"
      description="Defina uma nova senha para sua conta."
      footer={<AuthLink href="/login">Voltar ao login</AuthLink>}
    >
      <form className="space-y-4" onSubmit={submit}>
        {reset.error ? (
          <Alert tone="danger" title="Não foi possível redefinir.">
            {reset.error.message} <AuthLink href="/forgot">Pedir novo link</AuthLink>
          </Alert>
        ) : null}
        <Field
          label="Nova senha"
          htmlFor="password"
          hint={`Mínimo de ${MIN_PASSWORD} caracteres.`}
          error={passwordError}
        >
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={password}
            invalid={!!passwordError}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirmar nova senha" htmlFor="confirm" error={confirmError}>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            invalid={!!confirmError}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={reset.isPending}>
          Redefinir senha
        </Button>
      </form>
    </AuthCard>
  );
}
