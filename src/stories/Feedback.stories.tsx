import type { Meta, StoryObj } from "@storybook/react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadingState } from "@/components/ui/spinner";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { EmptyState, ErrorState } from "@/components/states";
import { Row, Section } from "./_helpers";

const meta: Meta = { title: "Feedback" };
export default meta;

export const EstadosObrigatorios: StoryObj = {
  name: "Carregando, erro, vazio",
  render: () => (
    <div className="grid max-w-5xl grid-cols-3 gap-5">
      <Section title="Carregando (skeleton)">
        <Card className="space-y-3 p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-3 w-32" />
        </Card>
      </Section>
      <Section title="Erro">
        <ErrorState error={new Error("Falha ao buscar o resumo (500).")} onRetry={() => {}} />
      </Section>
      <Section title="Vazio">
        <EmptyState
          icon={<FileUp />}
          title="Sem dados ainda"
          hint="Importe um extrato para ver o resumo do mês."
          action={<Button size="sm">Importar extrato</Button>}
        />
      </Section>
      <Section title="LoadingState (área inteira)">
        <LoadingState label="Carregando transações…" />
      </Section>
    </div>
  ),
};

function ToastDemo() {
  const { toast } = useToast();
  return (
    <Row>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            title: "Importação confirmada",
            description: "51 transações entraram nos números.",
            variant: "success",
          })
        }
      >
        Sucesso
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          toast({
            title: "Erro ao confirmar",
            description: "A API respondeu 409: lote já confirmado.",
            variant: "error",
          })
        }
      >
        Erro
      </Button>
      <Button variant="secondary" onClick={() => toast({ title: "Câmbio atualizado" })}>
        Info
      </Button>
    </Row>
  );
}

export const Toasts: StoryObj = {
  render: () => (
    <ToastProvider>
      <Section
        title="Toast"
        note="Resposta a uma ação. Erro fica 8s. Erros de carregamento de tela usam ErrorState, não toast."
      >
        <ToastDemo />
      </Section>
    </ToastProvider>
  ),
};
