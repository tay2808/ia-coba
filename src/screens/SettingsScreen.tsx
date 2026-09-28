import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Body, Button, Card, Row, Screen, Title } from '../components/ui';
import { APP_NAME } from '../config/constants';
import { collections, type PackRecord } from '../db';
import { useFocusData } from '../hooks/useFocusData';
import { exportBackup, restoreBackup } from '../services/backup/BackupService';
import { BASE_PACK_ID, uninstallPack } from '../services/curriculum/CurriculumImporter';
import { clearTemp } from '../services/fileSystem';

export default function SettingsScreen() {
  const [busy, setBusy] = useState<string | null>(null);
  const [packs, reload] = useFocusData(() => collections.packs.query().fetch() as Promise<PackRecord[]>, []);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <Card>
        <Title>🔒 Privacidad</Title>
        <Body>
          {APP_NAME} no usa internet: no hay cuentas, servidores ni telemetría. La app ni siquiera solicita el permiso de
          internet en su versión de producción. Tus conversaciones, documentos y progreso se guardan solo en este teléfono.
        </Body>
        <Button
          variant="ghost"
          label="🧹 Borrar archivos temporales"
          loading={busy === 'tmp'}
          onPress={() => run('tmp', async () => { await clearTemp(); Alert.alert('Listo', 'Se eliminaron los archivos temporales.'); })}
        />
      </Card>

      <Card>
        <Title>💾 Respaldo local</Title>
        <Body muted>Exporta tus chats, flashcards y resultados de quizzes a un archivo .zip que tú guardas donde quieras.</Body>
        <Row>
          <Button
            label="Exportar"
            loading={busy === 'export'}
            onPress={() => run('export', async () => {
              const name = await exportBackup();
              if (name) {
                Alert.alert('Respaldo guardado', name);
              }
            })}
          />
          <Button
            variant="secondary"
            label="Restaurar"
            loading={busy === 'restore'}
            onPress={() =>
              Alert.alert('Restaurar respaldo', 'Se reemplazarán tus chats y progreso actuales. ¿Continuar?', [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Restaurar',
                  onPress: () => run('restore', async () => {
                    const r = await restoreBackup();
                    if (r) {
                      Alert.alert('Respaldo restaurado', `${r.conversations} conversaciones y ${r.flashcards} flashcards.`);
                    }
                  }),
                },
              ])
            }
          />
        </Row>
      </Card>

      <Card>
        <Title>📦 Paquetes curriculares instalados</Title>
        {packs.map(p => (
          <Row key={p.id}>
            <Body style={{ flex: 1 }}>
              {p.name} · {p.curriculumVersion} · {p.subjectCount} materias · {p.chunkCount} fragmentos
            </Body>
            {p.packId !== BASE_PACK_ID && (
              <Button
                variant="ghost"
                label="Quitar"
                onPress={() => run('pack', async () => { await uninstallPack(p); await reload(); })}
              />
            )}
          </Row>
        ))}
      </Card>
    </Screen>
  );
}
