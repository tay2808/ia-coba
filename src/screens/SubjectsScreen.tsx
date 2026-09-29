import React, { useState } from 'react';
import { Alert, SectionList, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Q } from '@nozbe/watermelondb';
import { Body, Button, Card, Chip, ProgressBar, Row } from '../components/ui';
import { collections, type Subject } from '../db';
import { useFocusData } from '../hooks/useFocusData';
import type { RootStackParamList } from '../navigation/types';
import { pickAndImportPack } from '../services/curriculum/CurriculumImporter';
import { spacing, useTheme } from '../theme';

export default function SubjectsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const [semester, setSemester] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ message: string; fraction?: number } | null>(null);
  const [subjects, reload] = useFocusData(
    () => collections.subjects.query(Q.sortBy('semester', Q.asc), Q.sortBy('name', Q.asc)).fetch() as Promise<Subject[]>,
    [],
  );

  const importPack = async () => {
    try {
      const summary = await pickAndImportPack((message, fraction) => setProgress({ message, fraction }));
      if (summary) {
        Alert.alert(
          'Paquete instalado',
          `${summary.manifest.name} (${summary.manifest.curriculumVersion})\n` +
            `${summary.subjects} materias · ${summary.quizzes} preguntas · ${summary.flashcards} flashcards · ${summary.chunks} fragmentos` +
            (summary.replacedVersion ? `\nReemplazó la versión ${summary.replacedVersion}.` : ''),
        );
        reload();
      }
    } catch (e) {
      Alert.alert('No se pudo importar', e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  // El ciclo 2026-B solo imparte 1.º, 3.º y 5.º; los filtros salen de las materias instaladas.
  const semesters = [...new Set(subjects.map(s => s.semester))].sort((a, b) => a - b);
  const filtered = semester ? subjects.filter(s => s.semester === semester) : subjects;
  const sections = semesters
    .map(n => ({ title: `${n}.º semestre`, data: filtered.filter(s => s.semester === n) }))
    .filter(s => s.data.length);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Row>
        <Chip label="Todos" selected={semester === null} onPress={() => setSemester(null)} />
        {semesters.map(n => (
          <Chip key={n} label={`${n}.º`} selected={semester === n} onPress={() => setSemester(n)} />
        ))}
      </Row>
      <Button variant="secondary" label="📦 Importar paquete curricular" onPress={importPack} loading={!!progress} />
      {progress && (
        <View style={styles.progress}>
          <Body muted>{progress.message}</Body>
          <ProgressBar value={progress.fraction ?? 0} />
        </View>
      )}
      <SectionList
        sections={sections}
        keyExtractor={s => s.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <Body style={styles.header}>{section.title}</Body>}
        renderItem={({ item }) => (
          <Card onPress={() => navigation.navigate('SubjectDetail', { subjectCode: item.code })}>
            <Body style={styles.bold}>{item.name}</Body>
            <Body muted>{item.area}</Body>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  list: { gap: spacing.sm, paddingBottom: 40 },
  header: { fontWeight: '700', marginTop: spacing.md },
  bold: { fontWeight: '600' },
  progress: { gap: 6 },
});
