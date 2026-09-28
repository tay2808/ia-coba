import React, { useState } from 'react';
import { Body, Button, Card, Input, Row, Screen, Title } from '../../components/ui';
import { buildCorrectionPrompt } from '../../core/humanizer';
import { useStreamingTool } from '../../hooks/useStreamingTool';

export default function CorrectionScreen() {
  const [text, setText] = useState('');
  const tool = useStreamingTool();
  return (
    <Screen>
      <Input multiline value={text} onChangeText={setText} placeholder="Escribe o pega tu texto para corregirlo…" />
      <Row>
        <Button label="📝 Corregir" loading={tool.running} disabled={!text.trim()} onPress={() => tool.run(buildCorrectionPrompt(text))} />
        {tool.running && <Button label="Detener" variant="danger" onPress={tool.stop} />}
      </Row>
      {!!tool.output && (
        <Card>
          <Title>Corrección</Title>
          <Body>{tool.output}</Body>
        </Card>
      )}
    </Screen>
  );
}
