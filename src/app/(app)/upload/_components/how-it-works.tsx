import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const STEPS = [
  {
    title: "A gente lê o arquivo",
    body: "CSV, XLSX e OFX são lidos direto do arquivo — nenhum valor passa pela IA. Em PDF, os valores vêm do texto do extrato e a IA ajuda só onde o layout pede; fotos são extraídas pela IA.",
  },
  {
    title: "Você revisa só o que tem dúvida",
    body: "O que já está claro fica pronto. O resto aparece com o motivo da dúvida.",
  },
  {
    title: "Confirma e entra nos números",
    body: "Cada transação confirmada é convertida para EUR, USD e BRL pela taxa do dia da compra.",
  },
];

export function HowItWorks() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Como funciona</CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-[12px] font-semibold text-primary">
                {i + 1}
              </span>
              <div className="space-y-0.5">
                <p className="text-[13.5px] font-semibold text-foreground">{s.title}</p>
                <p className="text-[13px] leading-snug text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
