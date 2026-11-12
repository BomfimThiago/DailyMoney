import * as DocumentPicker from 'expo-document-picker';
import { Text, View } from 'react-native';

import { Button, Card, Chip } from '@/components/ui';
import type { PickedFile } from '@/lib/imports';
import type { Account, ImportPreview } from '@/lib/types';
import { CURRENCIES, importLabel, namesOk, totals } from '@/lib/upload';
import type { UploadFlow as Flow } from '@/lib/useUploadFlow';

import { AccountPicker, SincePicker } from './AccountPicker';
import { Done } from './Done';
import { DropZone } from './DropZone';
import { FileCard } from './FileCard';
import { PreviewRows } from './PreviewRows';
import { styles } from './styles';

const ACCEPT = [
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/x-ofx',
  'application/ofx',
  'application/pdf',
  'application/octet-stream',
  '.csv',
  '.ofx',
  '.xlsx',
  '.pdf',
];

export async function pickFile(): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ACCEPT,
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets[0];
  return { name: asset.name, uri: asset.uri, mimeType: asset.mimeType, file: asset.file };
}

// While a file is being read or imported, another pick is ignored.
export async function pickAndRead(flow: Pick<Flow, 'busy' | 'read'>) {
  if (flow.busy) return;
  const picked = await pickFile();
  if (picked) await flow.read(picked);
}

// Pick a file, answer what the app asks about it, then import.
export function UploadFlow({ flow, accounts }: { flow: Flow; accounts: Account[] }) {
  if (flow.done) return <Done summary={flow.done} onAgain={flow.reset} />;
  const { preview } = flow;
  return (
    <>
      {!preview || preview.needs_currency ? (
        <DropZone
          onPick={() => void pickAndRead(flow)}
          onFile={(f) => void flow.read(f)}
          reading={flow.reading}
        />
      ) : null}
      {flow.error ? <Text style={styles.error}>{flow.error}</Text> : null}
      {preview?.needs_currency ? <CurrencyQuestion preview={preview} flow={flow} /> : null}
      {preview && !preview.needs_currency ? (
        <Review preview={preview} flow={flow} accounts={accounts} />
      ) : null}
    </>
  );
}

function CurrencyQuestion({ preview, flow }: { preview: ImportPreview; flow: Flow }) {
  return (
    <Card style={styles.gap}>
      <Text style={styles.cardTitle}>Em que moeda está este extrato?</Text>
      <Text style={styles.note}>O arquivo {preview.filename} não diz a moeda dos valores.</Text>
      <View style={styles.chips}>
        {CURRENCIES.map((c) => (
          <Chip key={c} label={c} selected={false} onPress={() => void flow.chooseCurrency(c)} />
        ))}
      </View>
    </Card>
  );
}

function Review({
  preview,
  flow,
  accounts,
}: {
  preview: ImportPreview;
  flow: Flow;
  accounts: Account[];
}) {
  const count = totals(preview.groups);
  const blocked = count.new === 0 || !namesOk(preview.groups, flow.choices) || flow.refreshing;
  return (
    <>
      <FileCard preview={preview} count={count} refreshing={flow.refreshing} />
      {preview.groups.map((g) => (
        <AccountPicker
          key={g.currency}
          group={g}
          many={preview.groups.length > 1}
          accounts={accounts.filter((a) => a.currency === g.currency)}
          choice={flow.choices[g.currency]}
          onSelect={(c) => flow.selectAccount(g.currency, c)}
          onRename={(name) => flow.renameNew(g.currency, name)}
        />
      ))}
      {preview.groups.some((g) => g.first_import) ? (
        <SincePicker preview={preview} since={flow.since} onSelect={flow.selectSince} />
      ) : null}
      <PreviewRows rows={preview.rows} />
      <View style={styles.actions}>
        <Button label="Cancelar" onPress={() => void flow.cancel()} style={styles.flex1} />
        <Button
          primary
          label={importLabel(count.new)}
          onPress={() => void flow.submit()}
          disabled={blocked}
          busy={flow.importing}
          style={styles.flex2}
        />
      </View>
    </>
  );
}
