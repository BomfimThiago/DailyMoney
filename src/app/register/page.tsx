"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useRegister } from "@/hooks";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { AuthCard, AuthLink } from "../login/_components/auth-card";

const MIN_PASSWORD = 8;

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const register = useRegister();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

  const passwordError =
    submitted && password.length < MIN_PASSWORD ? `Use pelo menos ${MIN_PASSWORD} caracteres.` : undefined;
  const nameError = submitted && !name.trim() ? "Informe seu nome." : undefined;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (!name.trim() || password.length < MIN_PASSWORD) return;
    register.mutate(
      { email: email.trim(), password, name: name.trim() },
      {
        onSuccess: () => {
          toast({ variant: "success", title: "Conta criada!" });
          router.push("/dashboard");
          router.refresh();
        },
      },
    );
  }

  return (
    <AuthCard
      title="Criar conta"
      description="Comece a controlar os gastos da família."
      footer={
        <>
          Já tem conta? <AuthLink href="/login">Entrar</AuthLink>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        {register.error ? (
          <Alert tone="danger" title="Não foi possível criar a conta.">
            {register.error.message}
          </Alert>
        ) : null}
        <Field label="Seu nome" htmlFor="name" hint="Vira seu responsável padrão nas transações." error={nameError}>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            autoFocus
            value={name}
            invalid={!!nameError}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            type="email"
            spellCheck={false}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Senha" htmlFor="password" hint={`Mínimo de ${MIN_PASSWORD} caracteres.`} error={passwordError}>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            invalid={!!passwordError}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={register.isPending}>
          Criar conta
        </Button>
      </form>
    </AuthCard>
  );
}
