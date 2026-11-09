"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFinishBankAuthorization } from "@/hooks";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { LoadingState } from "@/components/ui/spinner";
import { ErrorState } from "@/components/states";

/**
 * Volta da autorização no banco (Enable Banking). Troca o código pela conexão e leva
 * para Importar, onde o banco aparece em "Bancos conectados". O código vale uma vez:
 * se falhar, o caminho é conectar de novo, não repetir.
 */
function Callback() {
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get("code");
  const state = params.get("state");
  const bankError = params.get("error");
  const bankErrorText = params.get("error_description");
  const finish = useFinishBankAuthorization(!bankError && code && state ? { code, state } : null);

  React.useEffect(() => {
    if (finish.data) router.replace("/upload");
  }, [finish.data, router]);

  const back = (
    <Button asChild variant="secondary">
      <Link href="/upload">Voltar para Importar</Link>
    </Button>
  );

  if (bankError) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="O banco não concluiu a autorização"
          error={
            new Error(
              bankError === "access_denied"
                ? "A autorização foi recusada ou cancelada no banco. Nada foi conectado."
                : `${bankErrorText || bankError}. Nada foi conectado.`,
            )
          }
        />
        {back}
      </div>
    );
  }
  if (!code || !state) {
    return (
      <div className="space-y-4">
        <ErrorState
          title="Retorno do banco incompleto"
          error={new Error("O endereço não trouxe o código da autorização. Comece a conexão de novo em Importar.")}
        />
        {back}
      </div>
    );
  }
  if (finish.isError) {
    return (
      <div className="space-y-4">
        <ErrorState title="Não deu para concluir a conexão" error={finish.error} />
        {back}
      </div>
    );
  }
  return (
    <Card className="p-6">
      <LoadingState label="Concluindo a autorização com o banco…" />
    </Card>
  );
}

export default function BankCallbackPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Conectando banco" description="A volta da autorização no banco." />
      <React.Suspense
        fallback={
          <Card className="p-6">
            <LoadingState />
          </Card>
        }
      >
        <Callback />
      </React.Suspense>
    </div>
  );
}
