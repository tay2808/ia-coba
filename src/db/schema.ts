import { appSchema, tableSchema } from '@nozbe/watermelondb';

/**
 * Esquema de la base de datos local (WatermelonDB sobre SQLite).
 * Incrementa `version` y agrega una migración en `migrations.ts` al cambiarlo.
 */
export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'conversations',
      columns: [
        { name: 'title', type: 'string' },
        { name: 'subject_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'mode', type: 'string' }, // chat | humanizer | explainer ...
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number', isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'messages',
      columns: [
        { name: 'conversation_id', type: 'string', isIndexed: true },
        { name: 'role', type: 'string' },
        { name: 'content', type: 'string' },
        { name: 'sources_json', type: 'string', isOptional: true },
        { name: 'attachment_text', type: 'string', isOptional: true },
        { name: 'tokens_per_second', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number', isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'llm_models',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'file_path', type: 'string' },
        { name: 'file_size', type: 'number' },
        { name: 'architecture', type: 'string' },
        { name: 'quantization', type: 'string' },
        { name: 'context_length', type: 'number', isOptional: true },
        { name: 'ram_estimate_mb', type: 'number' },
        { name: 'kind', type: 'string' }, // llm | embedding
        { name: 'is_active', type: 'boolean' },
        { name: 'imported_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'subjects',
      columns: [
        { name: 'code', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'semester', type: 'number', isIndexed: true },
        { name: 'area', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'units_json', type: 'string' },
        { name: 'pack_id', type: 'string', isIndexed: true },
      ],
    }),
    tableSchema({
      name: 'quiz_questions',
      columns: [
        { name: 'code', type: 'string' },
        { name: 'subject_code', type: 'string', isIndexed: true },
        { name: 'question', type: 'string' },
        { name: 'options_json', type: 'string' },
        { name: 'answer_index', type: 'number' },
        { name: 'explanation', type: 'string', isOptional: true },
        { name: 'origin', type: 'string' }, // pack | generated
      ],
    }),
    tableSchema({
      name: 'quiz_attempts',
      columns: [
        { name: 'subject_code', type: 'string', isIndexed: true },
        { name: 'total', type: 'number' },
        { name: 'correct', type: 'number' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'flashcards',
      columns: [
        { name: 'subject_code', type: 'string', isIndexed: true },
        { name: 'front', type: 'string' },
        { name: 'back', type: 'string' },
        { name: 'interval', type: 'number' },
        { name: 'ease', type: 'number' },
        { name: 'repetitions', type: 'number' },
        { name: 'due_at', type: 'number', isIndexed: true },
        { name: 'origin', type: 'string' },
      ],
    }),
    tableSchema({
      name: 'documents',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'kind', type: 'string' }, // txt | pdf | docx | image
        { name: 'subject_code', type: 'string', isOptional: true },
        { name: 'char_count', type: 'number' },
        { name: 'chunk_count', type: 'number' },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'packs',
      columns: [
        { name: 'pack_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'curriculum_version', type: 'string' },
        { name: 'subject_count', type: 'number' },
        { name: 'chunk_count', type: 'number' },
        { name: 'installed_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'settings',
      columns: [
        { name: 'key', type: 'string', isIndexed: true },
        { name: 'value', type: 'string' },
      ],
    }),
  ],
});
