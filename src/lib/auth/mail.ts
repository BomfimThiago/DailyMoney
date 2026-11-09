import { env } from "@/lib/env";

// Pluggable mail provider. For personal/local use the dev provider just logs the
// reset link to the server console. Swap for a real provider (Resend/SMTP) later.
export interface MailProvider {
  sendPasswordResetEmail(email: string, token: string): Promise<void>;
}

const appUrl = env.APP_URL;

const devMailProvider: MailProvider = {
  async sendPasswordResetEmail(email, token) {
    const link = `${appUrl}/reset?token=${encodeURIComponent(token)}`;
    console.log(`\n[mail:dev] Reset de senha para ${email}\n[mail:dev] Link: ${link}\n`);
  },
};

const provider: MailProvider = devMailProvider;

export function sendPasswordResetEmail(email: string, token: string) {
  return provider.sendPasswordResetEmail(email, token);
}
