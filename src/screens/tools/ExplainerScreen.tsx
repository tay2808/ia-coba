import React, { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Q } from '@nozbe/watermelondb';
import { Body, Button, Card, Input, Row, Screen, Title } from '../../components/ui';
import { buildStepByStepPrompt } from '../../core/study';
import { collections, type Subject } from '../../db';
import { useStreamingTool } from '../../hooks/useStreamingTool';
import type { RootStackParamList } from '../../navigation/types';
import { analyzeImage, captureFromCamera, cleanupImages, pickFromGallery } from '../../services/ocr/OcrService';

type Props = NativeStackScreenProps<RootStackParamList, 'Explainer'>;

export default function ExplainerScreen({ route, navigation }: Props) {
  const [problem, setProblem] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [subject, setSubject] = useState<Subject | null>(null);
  const tool = useStreamingTool();

  useEffect(() => {
    const code = route.params?.subjectCode;
    if (code) {
      collections.subjects.query(Q.where('code', code)).fetch().then(r => setSubject((r[0] as Subject) ?? null));
    }
  }, [route.params?.subjectCode]);

  const scan = async (source: 'camera' | 'gallery') => {
    const image = source === 'camera' ? await captureFromCamera() : await pickFromGallery();
    if (!image) {
      return;
    }
    setOcrBusy(true);
    try {
      const res = await analyzeImage(image);
      setImageUri(res.imageUri);
      setProblem(res.text);
      if (!res.text) {
        Alert.alert('Sin texto', 'No se detectó texto. Intenta con mejor luz y enfoque.');
      }
    } catch (e) {
      Alert.alert('Error de OCR', e instanceof Error ? e.message : String(e));
    } finally {
      await cleanupImages();
      setOcrBusy(false);
    }
  };

  return (
    <Screen>
      <Row>
        <Button style={styles.flex} label="📷 Tomar foto" loading={ocrBusy} onPress={() => scan('camera')} />
        <Button style={styles.flex} variant="secondary" label="🖼️ Galería" disabled={ocrBusy} onPress={() => scan('gallery')} />
      </Row>
      {imageUri && <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />}
      <Body muted>Revisa y corrige el texto detectado antes de pedir la explicación:</Body>
      <Input multiline value={problem} onChangeText={setProblem} placeholder="Escribe o escanea el ejercicio…" />
      <Row>
        <Button
          label="🧮 Explicar paso a paso"
          loading={tool.running}
          disabled={!problem.trim()}
          onPress={() => tool.run(buildStepByStepPrompt(problem, subject?.name))}
        />
        {tool.running && <Button label="Detener" variant="danger" onPress={tool.stop} />}
      </Row>
      {!!tool.output && (
        <Card>
          <Title>Explicación</Title>
          <Body>{tool.output}</Body>
          <Button
            variant="ghost"
            label="Seguir preguntando en el chat"
            onPress={() => navigation.navigate('Chat', { subjectCode: subject?.code, attachmentText: problem, initialText: 'Tengo una duda sobre este ejercicio: ' })}
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  image: { width: '100%', height: 200, borderRadius: 12 },
});
