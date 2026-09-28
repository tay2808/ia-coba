import React, { useState } from 'react';
import { Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Q } from '@nozbe/watermelondb';
import { Body, Button, Card, Empty, ProgressBar, Row, Screen, Title } from '../components/ui';
import { collections, type DocumentRecord } from '../db';
import { useFocusData } from '../hooks/useFocusData';
import type { RootStackParamList } from '../navigation/types';
import { deleteDocument, importDocument, type ProcessProgress } from '../services/documents/DocumentProcessor';
import { EmbeddingService } from '../services/rag/EmbeddingService';

type Props = NativeStackScreenProps<RootStackParamList, 'Documents'>;

const KIND_ICON = { txt: '📃', pdf: '📕', docx: '📘', image: '🖼️' };

export default function DocumentsScreen({ route }: Props) {
  const subjectCode = route.params?.subjectCode ?? null;
  const [progress, setProgress] = useState<ProcessProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [docs, reload] = useFocusData(
    () =>
      collections.documents
        .query(...(subjectCode ? [Q.where('subject_code', subjectCode)] : []), Q.sortBy('created_at', Q.desc))
        .fetch() as Promise<DocumentRecord[]>,
    [],
  );

  const onImport = async () => {
    if (!(await EmbeddingService.isAvailable())) {
      Alert.alert('Falta el modelo de embeddings', 'Esta compilación no incluye el modelo de búsqueda semántica (ver README).');
      return;
    }
    setBusy(true);
    try {
      const doc = await importDocument(subjectCode, setProgress);
      if (doc) {
        Alert.alert('Documento listo', `"${doc.name}" se indexó en ${doc.chunkCount} fragmentos. Ya puedes preguntar sobre él en el chat.`);
      }
    } catch (e) {
      Alert.alert('No se pudo procesar', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
      reload();
    }
  };

  const onDelete = (d: DocumentRecord) =>
    Alert.alert('Eliminar documento', `¿Eliminar "${d.name}" y sus fragmentos indexados?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await deleteDocument(d); reload(); } },
    ]);

  return (
    <Screen>
      <Button label="📥 Importar TXT, PDF o DOCX" onPress={onImport} loading={busy} />
      <Body muted>
        El texto se extrae y se indexa en tu teléfono. El archivo original se elimina de la caché al terminar; solo se
        guardan los fragmentos para la búsqueda.
      </Body>
      {progress && (
        <Card>
          <Body>{progress.stage === 'extrayendo' ? 'Leyendo páginas (OCR)…' : 'Indexando…'} {progress.done}/{progress.total}</Body>
          <ProgressBar value={progress.done / Math.max(1, progress.total)} />
        </Card>
      )}
      {docs.length === 0 && <Empty text="No has importado documentos." />}
      {docs.map(d => (
        <Card key={d.id}>
          <Title>{KIND_ICON[d.kind]} {d.name}</Title>
          <Body muted>{d.charCount.toLocaleString('es-MX')} caracteres · {d.chunkCount} fragmentos · {d.createdAt.toLocaleDateString('es-MX')}</Body>
          <Row>
            <Button label="Eliminar" variant="ghost" onPress={() => onDelete(d)} />
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
