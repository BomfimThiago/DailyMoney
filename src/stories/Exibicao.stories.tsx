import type { Meta, StoryObj } from "@storybook/react";
import { AlertTriangle, ArrowLeftRight, Check, RefreshCw, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import { Stepper } from "@/components/ui/stepper";
import { Money } from "@/components/finance/money";
import { Row, Section } from "./_helpers";

const meta: Meta = { title: "Exibição" };
export default meta;

export const Badges: StoryObj = {
  render: () => (
    <Section
      title="Badge"
      note="Cor tem significado fixo: verde entra/ok · âmbar pede ação · vermelho erro · azul interna/IA."
    >
      <Row>
        <Badge>neutro</Badge>
        <Badge variant="success">
          <Check />
          confirmado
        </Badge>
        <Badge variant="warning">pendente</Badge>
        <Badge variant="warning">
          <AlertTriangle />9 para revisar
        </Badge>
        <Badge variant="danger">
          <X />
          falhou
        </Badge>
        <Badge variant="info">
          <ArrowLeftRight />
          interna
        </Badge>
        <Badge variant="info">
          <RefreshCw />
          lendo…
        </Badge>
        <Badge variant="success">+0,3%</Badge>
        <Badge variant="danger">+12% vs jul</Badge>
        <Badge variant="outline">custom</Badge>
      </Row>
    </Section>
  ),
};

export const StatCards: StoryObj = {
  name: "StatCard",
  render: () => (
    <Section title="StatCard" note="Valor grande (Inter semibold, números tabulares) + linha com as outras moedas.">
      <div className="grid max-w-5xl grid-cols-4 gap-4">
        <StatCard
          label="Entradas"
          value={<Money value="6420" currency="EUR" kind="INCOME" size="display" align="left" />}
          delta={{ label: "+0,3%", tone: "success" }}
          footnote="R$ 41.216,40 · US$ 7.511,40"
        />
        <StatCard
          label="Gastos"
          value={<Money value="4183.52" currency="EUR" size="display" align="left" />}
          delta={{ label: "−21% vs jul", tone: "success" }}
          footnote="R$ 26.858,20 · US$ 4.894,72"
        />
        <StatCard label="Sobrou no mês" value="+€ 2.236,48" footnote="R$ 14.358,20 · US$ 2.616,68" />
        <StatCard
          label="Precisam de você"
          value={<span className="text-warning">9</span>}
          highlight="warning"
          footnote="de 63 linhas lidas"
        />
      </div>
    </Section>
  ),
};

export const Avisos: StoryObj = {
  name: "Alert (faixa de aviso)",
  render: () => (
    <div className="flex max-w-4xl flex-col gap-3">
      <Alert
        tone="warning"
        title="2 importações aguardando revisão."
        action={
          <Button variant="secondary" size="sm">
            Revisar agora
          </Button>
        }
      >
        9 transações com baixa confiança ainda não entraram nos números.
      </Alert>
      <Alert tone="brand" title="Layout reconhecido: “Revolut ES · CSV”.">
        Valores lidos de forma determinística — nenhum número passou pela IA.
      </Alert>
      <Alert
        tone="danger"
        title="Não foi possível ler o PDF."
        action={
          <Button variant="secondary" size="sm">
            Reprocessar
          </Button>
        }
      >
        O arquivo está protegido por senha.
      </Alert>
      <Alert tone="info" title="Câmbio de 14/08/2026.">
        Taxa BCE via Frankfurter.
      </Alert>
      <Alert tone="success" title="51 transações confirmadas." />
      <Alert
        tone="warning"
        title="Avisos da leitura:"
        items={[
          "1 linha(s) de saldo lidas pela IA não são transações e foram ignoradas: «Saldo do dia»",
          "Não foi possível determinar a moeda da transação — linhas 2, 3, 4, 5, 6 e mais 29",
          "Data inválida — linhas 6 e 11",
        ]}
      />
    </div>
  ),
};

export const PassosEProgresso: StoryObj = {
  name: "Stepper e Progress",
  render: () => (
    <>
      <Section title="Stepper">
        <Stepper steps={["Upload", "Leitura", "Revisão", "Confirmado"]} current={2} />
      </Section>
      <Section title="Progress">
        <div className="flex w-80 flex-col gap-4">
          <Progress value={42} tone="info" label="Lendo PDF" />
          <Progress value={80} />
          <Progress tone="warning" label="Indeterminado" />
        </div>
      </Section>
    </>
  ),
};
