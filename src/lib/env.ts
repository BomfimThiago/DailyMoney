import { z } from "zod";

// Fail fast and loud if config is missing — errors must be evident (req. 13).
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 chars"),
  // Endereço público do app (link do email de "esqueci a senha").
  APP_URL: z.string().default("http://localhost:3000"),
  // Cadastro aberto? O app é pessoal: sem isto, só o primeiro usuário (banco vazio) se cadastra.
  ALLOW_REGISTRATION: z
    .enum(["true", "false", ""])
    .default("")
    .transform((v) => v === "true"),
  ACCESS_TOKEN_TTL: z.string().default("15m"),
  REFRESH_TOKEN_TTL: z.string().default("30d"),
  EXTRACTION_PROVIDER: z.enum(["openrouter", "ollama", "none"]).default("openrouter"),
  OPENROUTER_API_KEY: z.string().default(""),
  OPENROUTER_VISION_MODEL: z.string().default("qwen/qwen2.5-vl-72b-instruct:free"),
  OPENROUTER_APP_URL: z.string().default("http://localhost:3000"),
  OPENROUTER_APP_NAME: z.string().default("Daily Money"),
  // Free models are slow (2-5 min for a full statement). Generous default.
  OPENROUTER_TIMEOUT_MS: z.coerce.number().default(300_000),
  // Ollama (local/self-hosted, OpenAI-compatible, grátis — sem API key). Para
  // PDFs extraímos a camada de texto localmente e mandamos ao modelo de texto;
  // imagens precisam de um modelo de visão em OLLAMA_VISION_MODEL.
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("qwen2.5:7b-instruct"),
  OLLAMA_VISION_MODEL: z.string().default(""),
  OLLAMA_TIMEOUT_MS: z.coerce.number().default(300_000),
  FX_BASE_URL: z.string().default("https://api.frankfurter.dev/v1"),
  // Pluggy (Open Finance BR, Meu Pluggy para uso pessoal): Client ID/Secret da Application.
  // Vazios = sincronização de banco desligada (a tela diz isso).
  PLUGGY_APP_ID: z.string().default(""),
  PLUGGY_APP_SECRET: z.string().default(""),
  PLUGGY_API_URL: z.string().default("https://api.pluggy.ai"),
  // Enable Banking (Open Banking na Europa, modo restrito: grátis para as próprias contas).
  // App ID da aplicação de produção + a chave privada que o painel baixou (<app-id>.pem):
  // num arquivo (ENABLE_BANKING_KEY_FILE) ou no próprio valor (PEM ou PEM em base64, que
  // cabe numa linha do .env). Vazios = Europa desligada (a tela diz isso).
  ENABLE_BANKING_APP_ID: z.string().default(""),
  ENABLE_BANKING_KEY_FILE: z.string().default(""),
  ENABLE_BANKING_PRIVATE_KEY: z.string().default(""),
  ENABLE_BANKING_API_URL: z.string().default("https://api.enablebanking.com"),
  // Para onde o banco devolve depois da autorização. Precisa ser IGUAL a um dos endereços
  // cadastrados na aplicação (https). Vazio: <endereço do app>/connections/callback.
  ENABLE_BANKING_REDIRECT_URL: z.string().default(""),
  // Segredo da rotina diária (POST /api/cron/sync). Vazio = rota desligada.
  CRON_SECRET: z.string().default(""),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;

// Em produção, o segredo do exemplo (ou um curto) deixaria qualquer um forjar sessões.
// Aviso alto no log em vez de derrubar o app: trocar o segredo encerra as sessões abertas.
if (process.env.NODE_ENV === "production" && (env.JWT_SECRET.length < 32 || /change-me/i.test(env.JWT_SECRET))) {
  console.error(
    "[env] JWT_SECRET fraco em produção: use 32+ caracteres aleatórios (openssl rand -base64 48) e reinicie.",
  );
}

export const aiExtractionEnabled =
  (env.EXTRACTION_PROVIDER === "openrouter" && env.OPENROUTER_API_KEY.length > 0) ||
  // Ollama não exige chave — basta o servidor estar acessível.
  env.EXTRACTION_PROVIDER === "ollama";

export const pluggyEnabled = env.PLUGGY_APP_ID.length > 0 && env.PLUGGY_APP_SECRET.length > 0;
export const enableBankingEnabled =
  env.ENABLE_BANKING_APP_ID.length > 0 &&
  (env.ENABLE_BANKING_KEY_FILE.length > 0 || env.ENABLE_BANKING_PRIVATE_KEY.length > 0);
