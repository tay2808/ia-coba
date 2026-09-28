import {
  PackValidationError,
  compareCurriculumVersions,
  parseChunksJsonl,
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

  it('el currículo base incluido es válido', () => {
    const subjects = validateSubjects(base);
    expect(subjects.length).toBeGreaterThan(10);
    expect(new Set(subjects.map(s => s.semester))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
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
