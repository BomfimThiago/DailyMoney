"use client";

import * as React from "react";
import { useForgotPassword } from "@/hooks";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { AuthCard, AuthLink } from "../login/_components/auth-card";

export default function ForgotPage() {
  const forgot = useForgotPassword();
  const [email, setEmail] = React.useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    forgot.mutate({ email: email.trim() });
  }

  return (
    <AuthCard
      title="Recuperar senha"
      description="Enviaremos um link para redefinir sua senha."
      footer={<AuthLink href="/login">Voltar ao login</AuthLink>}
    >
      {forgot.isSuccess ? (
        <div className="space-y-4">
          <Alert tone="success" title="Link enviado.">
            Se existir uma conta com {forgot.variables?.email}, o link de redefinição foi enviado. Em modo de
            desenvolvimento, o link aparece no console do servidor.
          </Alert>
          <Button variant="secondary" className="w-full" onClick={() => forgot.reset()}>
            Usar outro email
          </Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          {forgot.error ? (
            <Alert tone="danger" title="Não foi possível enviar.">
              {forgot.error.message}
            </Alert>
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
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={forgot.isPending}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
