"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLogin } from "@/hooks";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/label";
import { AuthCard, AuthLink } from "./_components/auth-card";

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  );
}

/**
 * Só aceita caminhos deste site (evita redirecionar para outro via ?next=). Resolve como o
 * navegador resolveria: "/%09/evil.com" e "/\\evil.com" viram outro host e são recusados.
 */
function safeNext(next: string | null): string {
  if (!next) return "/dashboard";
  try {
    const url = new URL(next, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : "/dashboard";
  } catch {
    return "/dashboard";
  }
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const login = useLogin();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: () => {
          router.push(safeNext(params.get("next")));
          router.refresh();
        },
      },
    );
  }

  return (
    <AuthCard
      title="Entrar"
      description="Acesse seu controle financeiro."
      footer={
        <>
          Não tem conta? <AuthLink href="/register">Criar conta</AuthLink>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        {login.error ? (
          <div id="login-error">
            <Alert tone="danger" title="Não foi possível entrar.">
              {login.error.message}
            </Alert>
          </div>
        ) : null}
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            spellCheck={false}
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-invalid={login.error ? true : undefined}
            aria-describedby={login.error ? "login-error" : undefined}
          />
        </Field>
        {/* O link "Esqueci a senha" aparece ao lado do rótulo, mas vem DEPOIS do campo na ordem
            do Tab (Email → Senha → Esqueci a senha), com área de toque maior. */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5">
          <Label htmlFor="password" className="col-start-1 row-start-1">
            Senha
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-invalid={login.error ? true : undefined}
            aria-describedby={login.error ? "login-error" : undefined}
            className="col-span-2 row-start-2"
          />
          <Link
            href="/forgot"
            className="col-start-2 row-start-1 -my-2 py-2 text-meta text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Esqueci a senha
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
          Entrar
        </Button>
      </form>
    </AuthCard>
  );
}
