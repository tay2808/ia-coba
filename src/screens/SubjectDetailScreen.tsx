import React, { useLayoutEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Q } from '@nozbe/watermelondb';
import { Body, Button, Card, Row, Screen, Title } from '../components/ui';
import { collections, type Subject } from '../db';
import { useFocusData } from '../hooks/useFocusData';
import type { RootStackParamList } from '../navigation/types';
import { useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'SubjectDetail'>;

export default function SubjectDetailScreen({ route, navigation }: Props) {
  const { subjectCode } = route.params;
  const { colors } = useTheme();
  const [data] = useFocusData(
    async () => {
      const [subject] = (await collections.subjects.query(Q.where('code', subjectCode)).fetch()) as Subject[];
      const [questions, cards, docs] = await Promise.all([
        collections.quizQuestions.query(Q.where('subject_code', subjectCode)).fetchCount(),
        collections.flashcards.query(Q.where('subject_code', subjectCode)).fetchCount(),
        collections.documents.query(Q.where('subject_code', subjectCode)).fetchCount(),
      ]);
      return { subject: subject ?? null, questions, cards, docs };
    },
    { subject: null as Subject | null, questions: 0, cards: 0, docs: 0 },
  );
  const s = data.subject;

  useLayoutEffect(() => {
    if (s) {
      navigation.setOptions({ title: s.name });
    }
  }, [navigation, s]);

  if (!s) {
    return <Screen><Body muted>Cargando…</Body></Screen>;
  }

  const askAbout = (topic: string) =>
    navigation.navigate('Chat', { subjectCode, initialText: `Explícame el tema "${topic}" de ${s.name} con un ejemplo.` });

  return (
    <Screen>
      <Card>
        <Title>{s.name}</Title>
        <Body muted>{s.semester}.º semestre · {s.area}</Body>
        {!!s.description && <Body>{s.description}</Body>}
      </Card>
      <Row>
        <Button style={styles.flex} label="💬 Preguntar" onPress={() => navigation.navigate('Chat', { subjectCode })} />
        <Button style={styles.flex} variant="secondary" label={`📝 Quiz (${data.questions})`} onPress={() => navigation.navigate('Quiz', { subjectCode })} />
      </Row>
      <Row>
        <Button style={styles.flex} variant="secondary" label={`🗂️ Flashcards (${data.cards})`} onPress={() => navigation.navigate('Flashcards', { subjectCode })} />
        <Button style={styles.flex} variant="ghost" label={`📄 Documentos (${data.docs})`} onPress={() => navigation.navigate('Documents', { subjectCode })} />
      </Row>
      <Button variant="ghost" label="🧮 Explicador paso a paso" onPress={() => navigation.navigate('Explainer', { subjectCode })} />
      {s.units.length === 0 && (
        <Card>
          <Body muted>
            Aún no hay unidades oficiales para esta materia. Puedes preguntar en el chat o importar su paquete curricular
            desde Materias.
          </Body>
        </Card>
      )}
      {s.units.map(unit => (
        <Card key={unit.id}>
          <Title>{unit.title}</Title>
          {unit.topics.map(topic => (
            <Text key={topic.id} style={[styles.topic, { color: colors.primary }]} onPress={() => askAbout(topic.title)}>
              • {topic.title}
            </Text>
          ))}
          <Button variant="ghost" label="Preguntar sobre esta unidad" onPress={() => askAbout(unit.title)} />
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topic: { paddingVertical: 4, fontSize: 15 },
});
