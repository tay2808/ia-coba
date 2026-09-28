import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Body, Button, Card, ProgressBar, Row, Screen, Title } from '../components/ui';
import { collections, type LlmModel } from '../db';
import { useFocusData } from '../hooks/useFocusData';
import { useLlmStatus } from '../hooks/useLlm';
import { getDeviceStats, THERMAL_LABELS, type DeviceStats } from '../services/deviceStats';
import { EmbeddingService } from '../services/rag/EmbeddingService';
import { VectorStore } from '../services/rag/VectorStore';
import { activateModel, deleteModel, importModel } from '../services/models/ModelManager';
import { useTheme } from '../theme';

const FIT_TEXT = { ok: '✅ Cabe holgadamente', ajustado: '⚠️ Uso de memoria ajustado', insuficiente: '⛔ Memoria insuficiente' };

const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(0)} MB`;

export default function ModelManagerScreen() {
  const { colors } = useTheme();
  const llm = useLlmStatus();
  const [importing, setImporting] = useState(false);
  const [data, reload] = useFocusData(
    async () => {
      const [models, stats, embeddings, vectors] = await Promise.all([
        collections.models.query().fetch() as Promise<LlmModel[]>,
        getDeviceStats(),
        EmbeddingService.isAvailable(),
        VectorStore.count().catch(() => 0),
      ]);
      return { models, stats, embeddings, vectors };
    },
    { models: [] as LlmModel[], stats: null as DeviceStats | null, embeddings: false, vectors: 0 },
  );

  const onImport = async () => {
    setImporting(true);
    try {
      const res = await importModel();
      if (res) {
        const { inspection } = res;
        Alert.alert(
          'Modelo importado',
          `${inspection.info.name}\nArquitectura: ${inspection.info.architecture} · ${inspection.info.quantization}\n` +
            `RAM estimada: ${inspection.ram.totalMb} MB (disponible: ${inspection.availableRamMb} MB)\n${FIT_TEXT[inspection.fit]}` +
            (inspection.info.hasChatTemplate ? '' : '\n⚠️ El modelo no incluye plantilla de chat; las respuestas pueden ser de menor calidad.'),
        );
        if (res.record.isActive) {
          await activateModel(res.record);
        }
      }
    } catch (e) {
      Alert.alert('No se pudo importar', e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
      reload();
    }
  };

  const onActivate = async (m: LlmModel) => {
    try {
      await activateModel(m);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    }
    reload();
  };

  const onDelete = (m: LlmModel) =>
    Alert.alert('Eliminar modelo', `¿Eliminar "${m.name}" (${mb(m.fileSize)}) del dispositivo?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await deleteModel(m); reload(); } },
    ]);

  const s = data.stats;
  return (
    <Screen>
      {s && (
        <Card>
          <Title>📱 Tu dispositivo</Title>
          <Body>RAM disponible: {s.availableRamMb} MB de {s.totalRamMb} MB{s.lowMemory ? ' (memoria baja)' : ''}</Body>
          <ProgressBar value={1 - s.availableRamMb / Math.max(1, s.totalRamMb)} />
          <Body muted>
            Núcleos: {s.cpuCores} · Temperatura: {s.thermalStatus >= 0 ? THERMAL_LABELS[s.thermalStatus] : 'N/D'}
            {s.batteryTemperatureC > 0 ? ` (${s.batteryTemperatureC.toFixed(1)} °C batería)` : ''}
          </Body>
        </Card>
      )}

      <Button label="📥 Importar modelo GGUF" onPress={onImport} loading={importing} />
      <Body muted>
        Recomendados: Llama-3.2-1B-Instruct o Qwen2.5-1.5B-Instruct en cuantización Q4_K_M. Copia el archivo .gguf a tu
        teléfono (USB o tarjeta SD) y selecciónalo aquí.
      </Body>

      {llm.status === 'loading' && (
        <Card>
          <Body>Cargando modelo…</Body>
          <ProgressBar value={(llm.progress ?? 0) / 100} />
        </Card>
      )}

      {data.models.map(m => (
        <Card key={m.id} style={m.isActive ? { borderColor: colors.primary, borderWidth: 2 } : undefined}>
          <Title>{m.isActive ? '⭐ ' : ''}{m.name}</Title>
          <Body muted>{m.architecture} · {m.quantization} · {mb(m.fileSize)}</Body>
          <Body muted>RAM estimada: {m.ramEstimateMb} MB{m.contextLength ? ` · contexto máx. ${m.contextLength}` : ''}</Body>
          {s && m.ramEstimateMb > s.availableRamMb && <Body style={{ color: colors.danger }}>Puede no caber en la RAM disponible ahora.</Body>}
          <Row>
            {!m.isActive || llm.modelPath !== m.filePath ? (
              <Button label="Activar" onPress={() => onActivate(m)} disabled={llm.status === 'loading'} />
            ) : (
              <Body style={{ color: colors.success }}>● En uso</Body>
            )}
            <Button label="Eliminar" variant="ghost" onPress={() => onDelete(m)} />
          </Row>
        </Card>
      ))}

      <Card>
        <Title>🔎 Motor de búsqueda (RAG)</Title>
        <Body>Embeddings: {data.embeddings ? 'all-MiniLM-L6-v2 (ONNX) instalado' : 'no instalado'}</Body>
        <Body muted>
          Base vectorial: {VectorStore.usingSqliteVec ? 'sqlite-vec' : 'búsqueda en memoria'} · {data.vectors} fragmentos indexados
        </Body>
      </Card>
    </Screen>
  );
}
