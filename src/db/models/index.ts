import { Model, Q, type Query, type Relation } from '@nozbe/watermelondb';
import { children, date, field, json, readonly, relation, text } from '@nozbe/watermelondb/decorators';
import type { ReviewState } from '../../core/study';
import type { Unit } from '../../core/curriculumPack';

const asArray = (raw: unknown) => (Array.isArray(raw) ? raw : []);

export interface MessageSource {
  source: string;
  score: number;
  text: string;
}

export class Conversation extends Model {
  static table = 'conversations';
  static associations = {
    messages: { type: 'has_many' as const, foreignKey: 'conversation_id' },
  };

  @text('title') title!: string;
  @field('subject_id') subjectId!: string | null;
  @field('mode') mode!: string;
  @readonly @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
  @children('messages') messages!: Query<Message>;

  get orderedMessages() {
    return this.collections
      .get<Message>('messages')
      .query(Q.where('conversation_id', this.id), Q.sortBy('created_at', Q.asc));
  }
}

export class Message extends Model {
  static table = 'messages';
  static associations = {
    conversations: { type: 'belongs_to' as const, key: 'conversation_id' },
  };

  @field('conversation_id') conversationId!: string;
  @field('role') role!: 'user' | 'assistant' | 'system';
  @field('content') content!: string;
  @json('sources_json', asArray) sources!: MessageSource[];
  @field('attachment_text') attachmentText!: string | null;
  @field('tokens_per_second') tokensPerSecond!: number | null;
  @readonly @date('created_at') createdAt!: Date;
  @relation('conversations', 'conversation_id') conversation!: Relation<Conversation>;
}

export class LlmModel extends Model {
  static table = 'llm_models';

  @text('name') name!: string;
  @field('file_path') filePath!: string;
  @field('file_size') fileSize!: number;
  @field('architecture') architecture!: string;
  @field('quantization') quantization!: string;
  @field('context_length') contextLength!: number | null;
  @field('ram_estimate_mb') ramEstimateMb!: number;
  @field('kind') kind!: 'llm' | 'embedding';
  @field('is_active') isActive!: boolean;
  @date('imported_at') importedAt!: Date;
}

export class Subject extends Model {
  static table = 'subjects';

  @field('code') code!: string;
  @text('name') name!: string;
  @field('semester') semester!: number;
  @field('area') area!: string;
  @field('description') description!: string | null;
  @json('units_json', asArray) units!: Unit[];
  @field('pack_id') packId!: string;
}

export class QuizQuestionRecord extends Model {
  static table = 'quiz_questions';

  @field('code') code!: string;
  @field('subject_code') subjectCode!: string;
  @text('question') question!: string;
  @json('options_json', asArray) options!: string[];
  @field('answer_index') answerIndex!: number;
  @field('explanation') explanation!: string | null;
  @field('origin') origin!: 'pack' | 'generated';
}

export class QuizAttempt extends Model {
  static table = 'quiz_attempts';

  @field('subject_code') subjectCode!: string;
  @field('total') total!: number;
  @field('correct') correct!: number;
  @readonly @date('created_at') createdAt!: Date;
}

export class Flashcard extends Model {
  static table = 'flashcards';

  @field('subject_code') subjectCode!: string;
  @text('front') front!: string;
  @text('back') back!: string;
  @field('interval') interval!: number;
  @field('ease') ease!: number;
  @field('repetitions') repetitions!: number;
  @field('due_at') dueAt!: number;
  @field('origin') origin!: 'pack' | 'generated' | 'user';

  get review(): ReviewState {
    return { interval: this.interval, ease: this.ease, repetitions: this.repetitions, dueAt: this.dueAt };
  }
}

export class DocumentRecord extends Model {
  static table = 'documents';

  @text('name') name!: string;
  @field('kind') kind!: 'txt' | 'pdf' | 'docx' | 'image';
  @field('subject_code') subjectCode!: string | null;
  @field('char_count') charCount!: number;
  @field('chunk_count') chunkCount!: number;
  @readonly @date('created_at') createdAt!: Date;
}

export class PackRecord extends Model {
  static table = 'packs';

  @field('pack_id') packId!: string;
  @text('name') name!: string;
  @field('curriculum_version') curriculumVersion!: string;
  @field('subject_count') subjectCount!: number;
  @field('chunk_count') chunkCount!: number;
  @date('installed_at') installedAt!: Date;
}

export class Setting extends Model {
  static table = 'settings';

  @field('key') key!: string;
  @field('value') value!: string;
}

export const modelClasses = [
  Conversation,
  Message,
  LlmModel,
  Subject,
  QuizQuestionRecord,
  QuizAttempt,
  Flashcard,
  DocumentRecord,
  PackRecord,
  Setting,
];
