import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Body, Button, Card, Input, ProgressBar, Row, Screen, Title } from '../../components/ui';
import { buildToneAnalysisPrompt, detectTone, type DetectedTone } from '../../core/toneDetector';
import { useStreamingTool } from '../../hooks/useStreamingTool';
import type { RootStackParamList } from '../../navigation/types';

const LABELS: Record<DetectedTone, string> = {
  formal: 'Formal',
  informal: 'Informal',
  academico: 'Académico',
  robotico: 'Robótico / tipo IA',
  neutral: 'Neutral',
};

export default function ToneDetectorScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [text, setText] = useState('');
  const report = useMemo(() => (text.trim().length > 20 ? detectTone(text) : null), [text]);
  const tool = useStreamingTool();
  const max = report ? Math.max(1, ...Object.values(report.scores)) : 1;

  return (
    <Screen>
      <Input multiline value={text} onChangeText={setText} placeholder="Pega un texto para analizar su tono…" />
      {report && (
        <Card>
          <Title>Tono: {LABELS[report.tone]}</Title>
          {(Object.keys(LABELS) as DetectedTone[]).map(k => (
            <Row key={k}>
              <Body style={{ width: 130 }}>{LABELS[k]}</Body>
              <View style={{ flex: 1 }}><ProgressBar value={report.scores[k] / max} /></View>
            </Row>
          ))}
          <Body muted>
            {report.stats.words} palabras · {report.stats.sentences} oraciones · {report.stats.avgSentenceLength} palabras/oración
          </Body>
          {report.hints.map(h => <Body key={h}>💡 {h}</Body>)}
          {report.tone === 'robotico' && (
            <Button variant="secondary" label="Humanizar este texto" onPress={() => navigation.navigate('Humanizer', { text })} />
          )}
        </Card>
      )}
      <Button label="🔍 Análisis profundo con IA" loading={tool.running} disabled={!text.trim()} onPress={() => tool.run(buildToneAnalysisPrompt(text))} />
      {!!tool.output && (
        <Card>
          <Body>{tool.output}</Body>
        </Card>
      )}
    </Screen>
  );
}
