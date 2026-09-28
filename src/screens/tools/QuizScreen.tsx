import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Q } from '@nozbe/watermelondb';
import { Body, Button, Card, Input, ProgressBar, Row, Screen, Title } from '../../components/ui';
import type { QuizQuestion } from '../../core/curriculumPack';
import { buildQuiz, gradeQuiz, type QuizAnswer, type QuizResult } from '../../core/study';
import { collections, type QuizAttempt, type Subject } from '../../db';
import type { RootStackParamList } from '../../navigation/types';
import { LlamaService } from '../../services/llm/LlamaService';
import { generateQuestions, getAttempts, getQuestionPool, saveAttempt } from '../../services/study/StudyService';
import { radius, useTheme } from '../../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Quiz'>;

const QUIZ_LENGTH = 10;

export default function QuizScreen({ route, navigation }: Props) {
  const { subjectCode } = route.params;
  const { colors } = useTheme();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [pool, setPool] = useState<QuizQuestion[]>([]);
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    const [s] = (await collections.subjects.query(Q.where('code', subjectCode)).fetch()) as Subject[];
    setSubject(s ?? null);
    setPool(await getQuestionPool(subjectCode));
    setAttempts(await getAttempts(subjectCode));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectCode]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: subject ? `Quiz · ${subject.name}` : 'Quiz' });
  }, [navigation, subject]);

  const start = () => {
    setQuiz(buildQuiz(pool, QUIZ_LENGTH));
    setIndex(0);
    setAnswers([]);
    setSelected(null);
    setResult(null);
  };

  const confirm = async () => {
    if (!quiz || selected === null) {
      return;
    }
    const next = [...answers, { questionId: quiz[index].id, selectedIndex: selected }];
    setAnswers(next);
    if (index + 1 < quiz.length) {
      setIndex(index + 1);
      setSelected(null);
    } else {
      const r = gradeQuiz(quiz, next);
      setResult(r);
      await saveAttempt(subjectCode, r);
      setAttempts(await getAttempts(subjectCode));
    }
  };

  const generate = async () => {
    if (!subject) {
      return;
    }
    if (!LlamaService.isReady()) {
      Alert.alert('Sin modelo', 'Activa un modelo en el Gestor de Modelos para generar preguntas.');
      return;
    }
    setGenerating(true);
    try {
      const qs = await generateQuestions(subject, topic.trim() || subject.name, 5);
      Alert.alert('Preguntas generadas', `Se agregaron ${qs.length} preguntas al banco de ${subject.name}.`);
      await load();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  if (result && quiz) {
    return (
      <Screen>
        <Card>
          <Title>Resultado: {result.grade} / 10</Title>
          <Body>{result.correct} de {result.total} correctas ({result.percentage}%)</Body>
          <ProgressBar value={result.percentage / 100} />
        </Card>
        {result.details.map(({ question, selectedIndex, isCorrect }, i) => (
          <Card key={question.id}>
            <Body style={styles.bold}>{isCorrect ? '✅' : '❌'} {i + 1}. {question.question}</Body>
            {!isCorrect && <Body muted>Tu respuesta: {question.options[selectedIndex] ?? '—'}</Body>}
            <Body>Correcta: {question.options[question.answerIndex]}</Body>
            {!!question.explanation && <Body muted>{question.explanation}</Body>}
          </Card>
        ))}
        <Button label="Intentar otro quiz" onPress={start} />
      </Screen>
    );
  }

  if (quiz) {
    const q = quiz[index];
    return (
      <Screen>
        <Body muted>Pregunta {index + 1} de {quiz.length}</Body>
        <ProgressBar value={index / quiz.length} />
        <Title>{q.question}</Title>
        {q.options.map((opt, i) => (
          <Pressable
            key={i}
            onPress={() => setSelected(i)}
            style={[
              styles.option,
              { borderColor: selected === i ? colors.primary : colors.border, backgroundColor: selected === i ? colors.surfaceAlt : colors.surface },
            ]}>
            <Text style={{ color: colors.text, fontSize: 15 }}>{String.fromCharCode(65 + i)}) {opt}</Text>
          </Pressable>
        ))}
        <Button label={index + 1 < quiz.length ? 'Siguiente' : 'Terminar'} disabled={selected === null} onPress={confirm} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Title>{subject?.name ?? 'Quiz'}</Title>
        <Body>{pool.length} preguntas disponibles en el banco.</Body>
        <Button label={`Comenzar quiz (${Math.min(QUIZ_LENGTH, pool.length)} preguntas)`} disabled={pool.length === 0} onPress={start} />
      </Card>
      <Card>
        <Title>✨ Generar preguntas con IA</Title>
        <Body muted>El modelo local crea preguntas nuevas usando los temas de la materia y tus documentos.</Body>
        <Input value={topic} onChangeText={setTopic} placeholder="Tema (opcional), p. ej. «ecuaciones lineales»" />
        <Button variant="secondary" label="Generar 5 preguntas" loading={generating} onPress={generate} />
      </Card>
      {attempts.length > 0 && (
        <Card>
          <Title>Historial</Title>
          {attempts.slice(0, 8).map(a => (
            <Row key={a.id}>
              <Body style={styles.flex}>{a.createdAt.toLocaleDateString('es-MX')}</Body>
              <Body style={styles.bold}>{Math.round((a.correct / Math.max(1, a.total)) * 100) / 10} / 10</Body>
            </Row>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { borderWidth: 2, borderRadius: radius.md, padding: 14 },
  bold: { fontWeight: '600' },
  flex: { flex: 1 },
});
