"use client";

import * as React from "react";
import { X, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "default" | "success" | "error";

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  variant: ToastVariant;
  /** Saindo: anima e depois é removido. */
  leaving?: boolean;
}

interface ToastContextValue {
  toast: (t: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

let counter = 0;
const EXIT_MS = 200;
const MAX_VISIBLE = 4;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  // Sai em duas etapas: marca `leaving` (anima a saída e fecha o espaço na pilha), depois remove.
  const remove = React.useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), EXIT_MS);
  }, []);

  // O mesmo aviso já na tela não se repete (200 linhas falhando de uma vez viram um só), e a
  // pilha guarda no máximo 4: sai primeiro o mais antigo que não é erro.
  const toast = React.useCallback<ToastContextValue["toast"]>(({ title, description, variant = "default" }) => {
    const id = ++counter;
    setToasts((prev) => {
      if (prev.some((t) => !t.leaving && t.title === title && t.description === description)) return prev;
      const next = [...prev, { id, title, description, variant }];
      while (next.filter((t) => !t.leaving).length > MAX_VISIBLE) {
        const drop = next.findIndex((t) => !t.leaving && t.variant !== "error");
        next.splice(drop === -1 ? next.findIndex((t) => !t.leaving) : drop, 1);
      }
      return next;
    });
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Região sempre montada: leitores de tela só anunciam o que entra numa região que já existia. */}
      <section
        aria-label="Notificações"
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[calc(100%-2rem)] max-w-sm flex-col pb-[env(safe-area-inset-bottom)]"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} onClose={remove} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}

const ICONS: Record<ToastVariant, React.ReactNode> = {
  default: <Info aria-hidden className="h-5 w-5 text-primary" />,
  success: <CheckCircle2 aria-hidden className="h-5 w-5 text-success" />,
  error: <AlertTriangle aria-hidden className="h-5 w-5 text-destructive" />,
};

// onClose estável (recebe o id): um toast novo não reinicia o relógio dos outros.
function ToastCard({ item, onClose }: { item: ToastItem; onClose: (id: number) => void }) {
  // Pausa enquanto o mouse ou o foco estão no toast (dá tempo de ler um erro longo).
  const [paused, setPaused] = React.useState(false);
  React.useEffect(() => {
    // Erro fica até a pessoa fechar: erro sempre visível, e há tempo de ler (WCAG 2.2.1).
    if (paused || item.leaving || item.variant === "error") return;
    const t = setTimeout(() => onClose(item.id), 4000);
    return () => clearTimeout(t);
  }, [paused, item.leaving, item.variant, item.id, onClose]);

  return (
    // grid-rows 1fr → 0fr: a pilha fecha o espaço suavemente quando um toast sai.
    <div
      className={cn(
        "grid transition-[grid-template-rows] duration-200 ease-out-strong",
        item.leaving ? "grid-rows-[0fr]" : "grid-rows-[1fr]",
      )}
    >
      <div className="min-h-0 overflow-hidden px-1 pt-2">
        <div
          role={item.variant === "error" ? "alert" : "status"}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
          className={cn(
            "pointer-events-auto mb-1 flex items-start gap-3 rounded-2xl bg-card p-4 shadow-overlay ease-out-strong",
            item.leaving
              ? "duration-200 animate-out fade-out-0 slide-out-to-right-1/2 fill-mode-forwards"
              : "duration-300 animate-in fade-in-0 slide-in-from-bottom-2",
            item.variant === "error" &&
              "shadow-[inset_3px_0_0_hsl(var(--destructive)),0_16px_40px_-8px_rgba(16,24,40,.18)]",
          )}
        >
          <div className="mt-0.5 shrink-0">{ICONS[item.variant]}</div>
          <div className="flex-1 space-y-0.5">
            <p className="text-[13.5px] font-semibold">{item.title}</p>
            {item.description ? <p className="text-sm text-muted-foreground">{item.description}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => onClose(item.id)}
            aria-label="Fechar notificação"
            className="-m-1 grid size-7 shrink-0 place-items-center rounded-md text-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
