import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Q } from '@nozbe/watermelondb';
import { Body, Button, Card, ProgressBar, Row, Screen, Title } from '../components/ui';
import { APP_NAME, CURRICULUM_VERSION } from '../config/constants';
import { collections, type Conversation } from '../db';
import { useFocusData } from '../hooks/useFocusData';
import { useLlmStatus } from '../hooks/useLlm';
import type { RootStackParamList } from '../navigation/types';
import { getActiveModel } from '../services/models/ModelManager';
import { useTheme } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const STATUS_TEXT = {
  idle: 'Sin modelo cargado',
  loading: 'Cargando modelo…',
  ready: 'Listo',
  generating: 'Generando…',
  error: 'Error al cargar',
} as const;

export default function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { colors } = useTheme();
  const llm = useLlmStatus();
  const [data] = useFocusData(
    async () => {
      const [model, due, recent] = await Promise.all([
        getActiveModel(),
        collections.flashcards.query(Q.where('due_at', Q.lte(Date.now()))).fetchCount(),
        collections.conversations.query(Q.sortBy('updated_at', Q.desc), Q.take(3)).fetch() as Promise<Conversation[]>,
      ]);
      return { modelName: model?.name ?? null, due, recent };
    },
    { modelName: null as string | null, due: 0, recent: [] as Conversation[] },
  );

  return (
    <Screen>
      <View style={[styles.hero, { backgroundColor: colors.primary }]}>
        <Text style={styles.heroTitle}>¡Hola! 👋</Text>
        <Text style={styles.heroText}>
          {APP_NAME} funciona 100% sin internet. Tus chats y documentos nunca salen de tu teléfono.
        </Text>
        <Text style={styles.badge}>✈️ Modo offline · Currículo {CURRICULUM_VERSION}</Text>
      </View>

      <Card onPress={() => navigation.navigate('ModelManager')}>
        <Title>🧠 Modelo de IA</Title>
        <Body>{data.modelName ?? 'Ningún modelo importado'}</Body>
        <Body muted>Estado: {STATUS_TEXT[llm.status]}{llm.error ? ` — ${llm.error}` : ''}</Body>
        {llm.status === 'loading' && <ProgressBar value={(llm.progress ?? 0) / 100} />}
        {!data.modelName && <Button label="Importar modelo GGUF" onPress={() => navigation.navigate('ModelManager')} />}
      </Card>

      <Row>
        <Button style={styles.flex} label="💬 Nuevo chat" onPress={() => navigation.navigate('Chat', {})} />
        <Button style={styles.flex} variant="secondary" label="📷 Foto de tarea" onPress={() => navigation.navigate('Explainer')} />
      </Row>

      <Card onPress={() => navigation.navigate('Flashcards', {})}>
        <Title>🗂️ Repaso de hoy</Title>
        <Body>{data.due > 0 ? `Tienes ${data.due} tarjetas pendientes de repasar.` : '¡Estás al día con tus flashcards!'}</Body>
      </Card>

      {data.recent.length > 0 && (
        <Card>
          <Title>Conversaciones recientes</Title>
          {data.recent.map(c => (
            <Text
              key={c.id}
              style={[styles.link, { color: colors.primary }]}
              onPress={() => navigation.navigate('Chat', { conversationId: c.id })}>
              › {c.title}
            </Text>
          ))}
        </Card>
      )}

      <Row>
        <Button style={styles.flex} variant="ghost" label="📄 Documentos" onPress={() => navigation.navigate('Documents')} />
        <Button style={styles.flex} variant="ghost" label="⚙️ Ajustes" onPress={() => navigation.navigate('Settings')} />
      </Row>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: 16, padding: 20, gap: 8 },
  heroTitle: { color: '#FFF', fontSize: 24, fontWeight: '800' },
  heroText: { color: '#E8F5EF', fontSize: 15, lineHeight: 21 },
  badge: { color: '#FFF', fontSize: 12, fontWeight: '600', marginTop: 4 },
  flex: { flex: 1 },
  link: { fontSize: 15, paddingVertical: 4 },
});
