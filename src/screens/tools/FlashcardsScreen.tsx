import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Q } from '@nozbe/watermelondb';
import { Body, Button, Card, Empty, Input, Row, Screen, Title } from '../../components/ui';
import { dueCards, type RecallQuality } from '../../core/study';
import { collections, type Flashcard, type Subject } from '../../db';
import type { RootStackParamList } from '../../navigation/types';
import { LlamaService } from '../../services/llm/LlamaService';
import { addFlashcards, generateFlashcards, getFlashcards, gradeFlashcard } from '../../services/study/StudyService';
import { radius, useTheme } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Flashcards'>;

const GRADES: Array<{ label: string; quality: RecallQuality; variant: 'danger' | 'secondary' | 'primary' | 'ghost' }> = [
  { label: 'No la sabía', quality: 1, variant: 'danger' },
  { label: 'Difícil', quality: 3, variant: 'secondary' },
  { label: 'Bien', quality: 4, variant: 'primary' },
  { label: 'Fácil', quality: 5, variant: 'ghost' },
];

export default function FlashcardsScreen({ route }: Props) {
  const subjectCode = route.params?.subjectCode;
  const { colors } = useTheme();
  const [queue, setQueue] = useState<Flashcard[]>([]);
  const [total, setTotal] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [front, setFront] = useState('');
  const [back, setBack] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    const all = await getFlashcards(subjectCode);
    setTotal(all.length);
    setQueue(dueCards(all, Date.now()));
    setFlipped(false);
    if (subjectCode) {
      const [s] = (await collections.subjects.query(Q.where('code', subjectCode)).fetch()) as Subject[];
      setSubject(s ?? null);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectCode]);

  const grade = async (quality: RecallQuality) => {
    const [card, ...rest] = queue;
    await gradeFlashcard(card, quality);
    // Las tarjetas falladas vuelven al final de la cola de esta sesión.
    setQueue(quality < 3 ? [...rest, card] : rest);
    setFlipped(false);
  };

  const addCard = async () => {
    if (!subjectCode || !front.trim() || !back.trim()) {
      return;
    }
    await addFlashcards(subjectCode, [{ front: front.trim(), back: back.trim() }], 'user');
    setFront('');
    setBack('');
    load();
  };

  const generate = async () => {
    if (!subject) {
      return;
    }
    if (!LlamaService.isReady()) {
      Alert.alert('Sin modelo', 'Activa un modelo en el Gestor de Modelos.');
      return;
    }
    setGenerating(true);
    try {
      const n = await generateFlashcards(subject, subject.name);
      Alert.alert('Listo', `Se crearon ${n} tarjetas nuevas.`);
      load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const card = queue[0];
  return (
    <Screen>
      <Body muted>{queue.length} pendientes · {total} tarjetas en total{subject ? ` · ${subject.name}` : ''}</Body>
      {card ? (
        <>
          <Pressable
            onPress={() => setFlipped(f => !f)}
            style={[styles.card, { backgroundColor: flipped ? colors.surfaceAlt : colors.surface, borderColor: colors.border }]}>
            <Text style={[styles.cardLabel, { color: colors.textMuted }]}>{flipped ? 'Respuesta' : 'Pregunta'} · toca para voltear</Text>
            <Text style={[styles.cardText, { color: colors.text }]}>{flipped ? card.back : card.front}</Text>
          </Pressable>
          {flipped && (
            <Row>
              {GRADES.map(g => (
                <Button key={g.label} label={g.label} variant={g.variant} onPress={() => grade(g.quality)} />
              ))}
            </Row>
          )}
        </>
      ) : (
        <Empty text="🎉 No hay tarjetas pendientes por ahora. ¡Vuelve más tarde!" />
      )}
      {subjectCode && (
        <Card>
          <Title>Agregar tarjeta</Title>
          <Input value={front} onChangeText={setFront} placeholder="Frente (pregunta o concepto)" />
          <Input value={back} onChangeText={setBack} placeholder="Reverso (respuesta)" />
          <Row>
            <Button label="Agregar" onPress={addCard} disabled={!front.trim() || !back.trim()} />
            <Button variant="secondary" label="✨ Generar con IA" loading={generating} onPress={generate} />
          </Row>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { minHeight: 220, borderRadius: radius.lg, borderWidth: 1, padding: 24, justifyContent: 'center', gap: 12 },
  cardLabel: { fontSize: 12, textAlign: 'center' },
  cardText: { fontSize: 20, textAlign: 'center', lineHeight: 28 },
});
