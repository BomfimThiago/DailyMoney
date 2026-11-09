"use client";

import * as React from "react";
import { UploadCloud } from "lucide-react";
import { useBanks, useUploadFile } from "@/hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const ACCEPT = ".csv,.tsv,.txt,.xls,.xlsx,.ofx,.pdf,.png,.jpg,.jpeg,.webp";
const EXTENSIONS = new Set(ACCEPT.split(",").map((e) => e.slice(1)));
const MAX_BYTES = 15 * 1024 * 1024; // o mesmo limite da API

/** Recusa antes de enviar o que a API recusaria (formato, tamanho, vazio), com o motivo. */
function rejectReason(file: File): string | null {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!EXTENSIONS.has(ext)) return "Formato não suportado. Envie CSV, XLSX, OFX, PDF ou foto.";
  if (file.size === 0) return "O arquivo está vazio.";
  if (file.size > MAX_BYTES)
    return `Ele tem ${(file.size / 1024 / 1024).toFixed(1).replace(".", ",")} MB; o limite é 15 MB.`;
  return null;
}

/**
 * Área de envio: arrastar e soltar (vários arquivos) ou "Escolher arquivos",
 * mais o rótulo opcional de banco/conta. Cada arquivo é uma chamada; enquanto
 * houver envio em andamento mostra progresso com os nomes.
 */
export function UploadDropzone() {
  const upload = useUploadFile();
  const banks = useBanks();
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dragDepth = React.useRef(0);
  const [bank, setBank] = React.useState("");
  const [dragging, setDragging] = React.useState(false);
  const [sending, setSending] = React.useState<{ key: string; name: string }[]>([]);
  const uploading = sending.length > 0;

  function send(files: FileList | null) {
    if (!files || files.length === 0) return;
    const label = bank.trim() || undefined;
    const accepted = Array.from(files).filter((file) => {
      const reason = rejectReason(file);
      if (reason) toast({ variant: "error", title: `${file.name} não foi enviado`, description: reason });
      return !reason;
    });
    for (const file of accepted) {
      const key = `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`;
      setSending((s) => [...s, { key, name: file.name }]);
      upload
        .mutateAsync({ file, bank: label })
        // O hook já mostra o toast de erro; falha de leitura aparece na própria linha.
        .catch(() => undefined)
        .finally(() => setSending((s) => s.filter((x) => x.key !== key)));
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  const bankHint = banks.isLoading
    ? "Carregando contas já usadas…"
    : "O banco é reconhecido no OFX, no PDF e no CSV de bancos conhecidos. Preencha para dar outro nome ou quando não for reconhecido.";

  return (
    <Card>
      <CardContent className="space-y-5 p-3 sm:p-4">
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => {
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragging(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            send(e.dataTransfer.files);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-4 rounded-xl bg-muted px-6 py-12 text-center transition-colors",
            dragging && "bg-primary-soft ring-2 ring-primary",
          )}
        >
          <span className="grid size-12 place-items-center rounded-xl bg-field text-primary shadow-control">
            <UploadCloud className="size-6" />
          </span>
          <div className="space-y-1">
            <p className="text-[15px] font-semibold text-foreground">
              {dragging ? "Pode soltar" : "Solte os arquivos aqui"}
            </p>
            <p className="text-meta text-subtle">CSV, XLSX, OFX, PDF ou foto de recibo · vários de uma vez</p>
          </div>
          <Button type="button" loading={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? "Enviando…" : "Escolher arquivos"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => send(e.target.files)}
          />
          {/* Região viva sempre presente: o leitor de tela anuncia quando o envio começa. */}
          <div className="w-full max-w-sm space-y-2 empty:hidden" aria-live="polite">
            {uploading ? (
              <>
                <Progress tone="info" label="Enviando arquivos" />
                <p className="truncate text-meta text-muted-foreground">
                  {sending.length === 1
                    ? `Lendo ${sending[0].name}…`
                    : `Lendo ${sending.length} arquivos: ${sending.map((s) => s.name).join(", ")}`}
                </p>
              </>
            ) : null}
          </div>
        </div>

        <div className="px-2 pb-1">
          <Field
            label="Banco ou conta (opcional)"
            htmlFor="upload-bank"
            hint={banks.isError ? undefined : bankHint}
            error={banks.isError ? `Não deu para carregar as contas já usadas: ${banks.error.message}` : undefined}
            className="max-w-md"
          >
            <Input
              id="upload-bank"
              list="upload-bank-list"
              placeholder="Detectar automaticamente"
              autoComplete="off"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
            />
          </Field>
          <datalist id="upload-bank-list">
            {banks.data?.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </div>
      </CardContent>
    </Card>
  );
}
