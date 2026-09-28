import React, { useState } from 'react';
import { Share } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Body, Button, Card, Chip, Input, Row, Screen, Title } from '../../components/ui';
import { TONE_PROFILES, buildHumanizerPrompt, cleanRewriteOutput, type ToneId } from '../../core/humanizer';
import { detectTone } from '../../core/toneDetector';
import { useStreamingTool } from '../../hooks/useStreamingTool';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Humanizer'>;

export default function HumanizerScreen({ route }: Props) {
  const [text, setText] = useState(route.params?.text ?? '');
  const [tone, setTone] = useState<ToneId>('estudiante');
  const [extra, setExtra] = useState('');
  const tool = useStreamingTool();
  const report = tool.output && !tool.running ? detectTone(tool.output) : null;

  return (
    <Screen>
      <Input multiline value={text} onChangeText={setText} placeholder="Pega aquí el texto que quieres humanizar…" />
      <Body muted>{text.trim().split(/\s+/).filter(Boolean).length} palabras</Body>
      <Title>Tono</Title>
      <Row>
        {Object.values(TONE_PROFILES).map(p => (
          <Chip key={p.id} label={p.label} selected={tone === p.id} onPress={() => setTone(p.id)} />
        ))}
      </Row>
      <Body muted>{TONE_PROFILES[tone].description}</Body>
      <Input value={extra} onChangeText={setExtra} placeholder="Indicación extra (opcional): p. ej. «más corto»" />
      <Row>
        <Button
          label="✍️ Humanizar"
          loading={tool.running}
          disabled={!text.trim()}
          onPress={() => tool.run(buildHumanizerPrompt({ text, tone, extraInstruction: extra }), cleanRewriteOutput)}
        />
        {tool.running && <Button label="Detener" variant="danger" onPress={tool.stop} />}
      </Row>
      {!!tool.output && (
        <Card>
          <Title>Resultado</Title>
          <Body>{tool.output}</Body>
          {report && (
            <Body muted>
              Tono detectado: {report.tone} · {report.stats.words} palabras{tool.tps ? ` · ${tool.tps} tokens/s` : ''}
            </Body>
          )}
          <Row>
            <Button variant="secondary" label="Usar como nuevo texto" onPress={() => setText(tool.output)} />
            <Button variant="ghost" label="Compartir" onPress={() => Share.share({ message: tool.output })} />
          </Row>
        </Card>
      )}
    </Screen>
  );
}
