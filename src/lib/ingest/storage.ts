import { mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

// Raw uploaded files are kept on disk (outside git) for audit/re-processing.
const STORAGE_DIR = join(process.cwd(), "storage", "uploads");

export async function saveRawFile(uploadId: string, filename: string, bytes: Buffer): Promise<string> {
  await mkdir(STORAGE_DIR, { recursive: true });
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = join(STORAGE_DIR, `${uploadId}__${safe}`);
  await writeFile(path, bytes);
  return path;
}

/**
 * Apaga o arquivo bruto de uma importação excluída (extratos são dados pessoais:
 * não devem ficar no disco depois que o usuário exclui). Só aceita caminhos
 * dentro de storage/uploads. Arquivo já ausente não é erro.
 * Retorna "deleted" | "missing"; lança em qualquer outra falha.
 */
export async function deleteRawFile(path: string | null | undefined): Promise<"deleted" | "missing"> {
  if (!path) return "missing";
  const abs = resolve(path);
  if (!abs.startsWith(resolve(STORAGE_DIR) + sep)) {
    throw new Error(`Caminho fora da pasta de uploads, não apagado: ${path}`);
  }
  try {
    await unlink(abs);
    return "deleted";
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return "missing";
    throw err;
  }
}
