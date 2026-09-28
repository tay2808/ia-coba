import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Body, Card, Screen } from '../components/ui';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TOOLS: Array<{ icon: string; title: string; description: string; go: (n: Nav) => void }> = [
  { icon: '✍️', title: 'Humanizador de textos', description: 'Reescribe con tono de estudiante, profesional, casual…', go: n => n.navigate('Humanizer') },
  { icon: '🧮', title: 'Explicador paso a paso', description: 'Toma foto de un ejercicio y entiéndelo paso a paso.', go: n => n.navigate('Explainer') },
  { icon: '📝', title: 'Corrección de redacción', description: 'Ortografía, puntuación y estilo.', go: n => n.navigate('Correction') },
  { icon: '🎭', title: 'Detector de tono', description: 'Descubre cómo suena tu texto.', go: n => n.navigate('ToneDetector') },
  { icon: '🗂️', title: 'Flashcards', description: 'Repaso con repetición espaciada.', go: n => n.navigate('Flashcards', {}) },
  { icon: '📄', title: 'Mis documentos', description: 'Importa TXT, PDF o DOCX para consultarlos en el chat.', go: n => n.navigate('Documents') },
  { icon: '🧠', title: 'Gestor de modelos', description: 'Importa modelos GGUF y revisa el uso de RAM.', go: n => n.navigate('ModelManager') },
];

export default function ToolsScreen() {
  const navigation = useNavigation<Nav>();
  return (
    <Screen>
      {TOOLS.map(tool => (
        <Card key={tool.title} onPress={() => tool.go(navigation)}>
          <View style={styles.row}>
            <Text style={styles.icon}>{tool.icon}</Text>
            <View style={styles.flex}>
              <Body style={styles.bold}>{tool.title}</Body>
              <Body muted>{tool.description}</Body>
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  icon: { fontSize: 28 },
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
});
