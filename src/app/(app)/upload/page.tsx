"use client";

import { PageHeader } from "@/components/ui/page-header";
import { UploadDropzone } from "./_components/upload-dropzone";
import { HowItWorks } from "./_components/how-it-works";
import { RecentUploads } from "./_components/recent-uploads";
import { ConnectedBanks } from "./_components/connected-banks";

export default function UploadPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        className="pb-0"
        title="Importar"
        description="Extratos e recibos de qualquer banco, em qualquer das 3 moedas — ou direto do banco conectado."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <UploadDropzone />
        <HowItWorks />
      </div>

      <ConnectedBanks />

      <RecentUploads />
    </div>
  );
}
