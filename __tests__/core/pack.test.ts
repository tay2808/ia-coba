import {
  PackValidationError,
  compareCurriculumVersions,
  parseChunksJsonl,
  semestersForCurriculumVersion,
  validateManifest,
  validateSubjects,
} from '../../src/core/curriculumPack';
import base from '../../assets/curriculum/cobaev-2026b-base.json';

const manifest = {
  format: 'cobaev-pack',
  formatVersion: 1,
  id: 'quimica-1',
  name: 'Química I',
  curriculumVersion: '2026-B',
  createdAt: '2026-08-01T00:00:00Z',
  embedding: { model: 'all-MiniLM-L6-v2', dim: 384, count: 2 },
  files: { subjects: 'subjects.json', chunks: 'chunks.jsonl', embeddings: 'embeddings.f32' },
};

describe('paquetes curriculares', () => {
  it('acepta un manifest válido', () => {
    expect(validateManifest(manifest).id).toBe('quimica-1');
  });

  it('rechaza rutas peligrosas y campos faltantes', () => {
    try {
      validateManifest({ ...manifest, id: '', files: { subjects: '../../etc/passwd', embeddings: 'e.f32' }, embedding: null });
      fail('debió fallar');
    } catch (e) {
      expect(e).toBeInstanceOf(PackValidationError);
      const problems = (e as PackValidationError).problems.join(' ');
      expect(problems).toContain('falta id');
      expect(problems).toContain('no permitido');
      expect(problems).toContain('requiere files.chunks');
    }
  });

  it('valida materias, quizzes y flashcards', () => {
    expect(() =>
      validateSubjects([
        { id: 'a', name: 'A', semester: 1, area: 'x', units: [], quizzes: [{ id: 'q', question: '¿?', options: ['1', '2'], answerIndex: 5 }] },
        { id: 'a', name: 'B', semester: 9, area: 'x', units: [] },
      ]),
    ).toThrow(/answerIndex fuera de rango[\s\S]*id duplicado[\s\S]*semester/);
  });

  it('el currículo base incluido es válido y solo trae los semestres del ciclo 2026-B', () => {
    const subjects = validateSubjects(base, { curriculumVersion: '2026-B' });
    expect(subjects.length).toBeGreaterThan(10);
    expect(new Set(subjects.map(s => s.semester))).toEqual(new Set([1, 3, 5]));
    const ids = subjects.flatMap(s => [
      ...s.units.flatMap(u => [u.id, ...u.topics.map(t => t.id)]),
      ...(s.quizzes ?? []).map(q => q.id),
      ...(s.flashcards ?? []).map(f => f.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('limita los semestres según el ciclo escolar', () => {
    expect(semestersForCurriculumVersion('2026-B')).toEqual([1, 3, 5]);
    expect(semestersForCurriculumVersion('2027-a')).toEqual([2, 4, 6]);
    expect(semestersForCurriculumVersion('plantilla')).toBeNull();
    const subjects = [{ id: 'x', name: 'X', semester: 2, area: 'a', units: [] }];
    expect(() => validateSubjects(subjects, { curriculumVersion: '2026-B' })).toThrow(/no se cursa en el ciclo 2026-B/);
    expect(validateSubjects(subjects, { curriculumVersion: '2027-A' })).toHaveLength(1);
    expect(validateSubjects(subjects)).toHaveLength(1);
  });

  it('parsea chunks JSONL', () => {
    const chunks = parseChunksJsonl('{"id":"1","text":"hola"}\n\n{"id":"2","text":"adiós","source":"Guía"}\n');
    expect(chunks).toEqual([
      { id: '1', text: 'hola', source: 'Paquete curricular' },
      { id: '2', text: 'adiós', source: 'Guía' },
    ]);
    expect(() => parseChunksJsonl('{mal json}')).toThrow(PackValidationError);
  });

  it('compara versiones curriculares', () => {
    expect(compareCurriculumVersions('2026-B', '2026-A')).toBeGreaterThan(0);
    expect(compareCurriculumVersions('2025-B', '2026-A')).toBeLessThan(0);
    expect(compareCurriculumVersions('2026-B', '2026-b')).toBe(0);
  });
});
