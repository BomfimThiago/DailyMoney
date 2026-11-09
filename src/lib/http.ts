import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";

// Standard JSON error shape so the frontend can always show something useful.
export interface ApiErrorBody {
  error: { message: string; code?: string; details?: unknown };
}

export class HttpError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, "BAD_REQUEST", details);
export const unauthorized = (msg = "Não autenticado") => new HttpError(401, msg, "UNAUTHORIZED");
export const forbidden = (msg = "Sem permissão") => new HttpError(403, msg, "FORBIDDEN");
export const notFound = (msg = "Não encontrado") => new HttpError(404, msg, "NOT_FOUND");
export const conflict = (msg: string) => new HttpError(409, msg, "CONFLICT");

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

// Wrap a route handler so any thrown error becomes a clean JSON response.
export function handle(
  fn: (req: Request, ctx: any) => Promise<Response>,
): (req: Request, ctx: any) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): NextResponse<ApiErrorBody> {
  if (err instanceof HttpError) {
    return NextResponse.json(
      { error: { message: err.message, code: err.code, details: err.details } },
      { status: err.status },
    );
  }
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          message: "Dados inválidos",
          code: "VALIDATION",
          details: err.flatten(),
        },
      },
      { status: 400 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: { message: "Registro duplicado", code: "CONFLICT" } }, { status: 409 });
    }
  }
  // Erro inesperado: o detalhe (consulta, host interno, chave) fica no log do servidor.
  console.error("[api] unhandled error:", err);
  return NextResponse.json(
    { error: { message: "Erro interno no servidor. O detalhe ficou no log.", code: "INTERNAL" } },
    { status: 500 },
  );
}
