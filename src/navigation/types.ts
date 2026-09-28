export type RootStackParamList = {
  Tabs: undefined;
  Chat: { conversationId?: string; subjectCode?: string; initialText?: string; attachmentText?: string };
  SubjectDetail: { subjectCode: string };
  Quiz: { subjectCode: string };
  Flashcards: { subjectCode?: string };
  Humanizer: { text?: string } | undefined;
  Correction: undefined;
  ToneDetector: undefined;
  Explainer: { subjectCode?: string } | undefined;
  ModelManager: undefined;
  Documents: { subjectCode?: string } | undefined;
  Settings: undefined;
};

export type TabParamList = {
  Inicio: undefined;
  Conversaciones: undefined;
  Materias: undefined;
  Herramientas: undefined;
};
