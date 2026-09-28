import {
  TONE_PROFILES,
  buildCorrectionPrompt,
  buildHumanizerPrompt,
  cleanRewriteOutput,
} from '../../src/core/humanizer';
import { detectTone } from '../../src/core/toneDetector';

describe('humanizer', () => {
  it('incluye las pautas del tono y las reglas anti-robot', () => {
    const p = buildHumanizerPrompt({ text: 'La fotosíntesis es un proceso.', tone: 'estudiante' });
    expect(p.system).toContain('Estudiante COBAEV');
    expect(p.system).toContain('16 años');
    expect(p.system).toContain('Conserva exactamente el significado');
    expect(p.user).toContain('La fotosíntesis es un proceso.');
    expect(p.temperature).toBe(TONE_PROFILES.estudiante.temperature);
  });

  it('agrega la instrucción extra del usuario', () => {
    const p = buildHumanizerPrompt({ text: 'Hola', tone: 'profesional', extraInstruction: 'más corto' });
    expect(p.system).toContain('Indicación adicional del usuario: más corto');
  });

  it('rechaza texto vacío y tonos desconocidos', () => {
    expect(() => buildHumanizerPrompt({ text: '   ', tone: 'casual' })).toThrow();
    expect(() => buildHumanizerPrompt({ text: 'x', tone: 'pirata' as never })).toThrow();
    expect(() => buildCorrectionPrompt('')).toThrow();
  });

  it('limpia prefijos y comillas envolventes', () => {
    expect(cleanRewriteOutput('Aquí está el texto reescrito: "Hola mundo"')).toBe('Hola mundo');
    expect(cleanRewriteOutput('«Texto»')).toBe('Texto');
    expect(cleanRewriteOutput('Sin cambios')).toBe('Sin cambios');
  });
});

describe('detector de tono', () => {
  it('detecta texto robótico', () => {
    const r = detectTone(
      'En la actualidad, la tecnología juega un papel crucial. Cabe destacar que es fundamental. ' +
        'En conclusión, sin lugar a dudas es importante mencionar su impacto.',
    );
    expect(r.tone).toBe('robotico');
    expect(r.hints.length).toBeGreaterThan(0);
  });

  it('detecta texto informal', () => {
    expect(detectTone('Neta wey, estuvo bien chido el examen jaja, o sea sí pasé!!').tone).toBe('informal');
  });

  it('detecta texto formal', () => {
    expect(detectTone('Estimado profesor, por medio de la presente le solicito una prórroga. Atentamente, Ana.').tone).toBe('formal');
  });

  it('calcula estadísticas', () => {
    const r = detectTone('Una oración corta. Otra oración un poco más larga que la anterior.');
    expect(r.stats.sentences).toBe(2);
    expect(r.stats.words).toBe(12);
  });
});
