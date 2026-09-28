import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Q } from '@nozbe/watermelondb';
import { collections, type Conversation, type Message, type MessageSource, type Subject } from '../db';
import { useLlmStatus } from '../hooks/useLlm';
import type { RootStackParamList } from '../navigation/types';
import { createConversation, getMessages, sendMessage } from '../services/chat/ChatService';
import { LlamaService } from '../services/llm/LlamaService';
import { analyzeImage, captureFromCamera, cleanupImages, pickFromGallery } from '../services/ocr/OcrService';
import { radius, spacing, useTheme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

interface UiMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: MessageSource[];
  tps?: number | null;
  hasAttachment?: boolean;
}

const toUi = (m: Message): UiMessage => ({
  id: m.id,
  role: m.role,
  content: m.content,
  sources: m.sources,
  tps: m.tokensPerSecond,
  hasAttachment: !!m.attachmentText,
});

export default function ChatScreen({ route, navigation }: Props) {
  const { colors } = useTheme();
  const llm = useLlmStatus();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState(route.params?.initialText ?? '');
  const [attachment, setAttachment] = useState<string | null>(route.params?.attachmentText ?? null);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [useRag, setUseRag] = useState(true);
  const listRef = useRef<FlatList<UiMessage>>(null);
  const streamBuffer = useRef('');
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const { conversationId, subjectCode } = route.params ?? {};
      let conv: Conversation | null = null;
      if (conversationId) {
        conv = (await collections.conversations.find(conversationId)) as Conversation;
        setMessages((await getMessages(conv.id)).map(toUi));
      }
      const code = subjectCode ?? conv?.subjectId;
      if (code) {
        const [s] = (await collections.subjects.query(Q.where('code', code)).fetch()) as Subject[];
        setSubject(s ?? null);
      }
      setConversation(conv);
    })().catch(e => Alert.alert('Error', String(e)));
  }, [route.params]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: subject ? `Chat · ${subject.name}` : conversation?.title ?? 'Nuevo chat' });
  }, [navigation, subject, conversation]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const attachPhoto = async (source: 'camera' | 'gallery') => {
    const image = source === 'camera' ? await captureFromCamera() : await pickFromGallery();
    if (!image) {
      return;
    }
    setOcrBusy(true);
    try {
      const result = await analyzeImage(image);
      if (!result.text) {
        Alert.alert('Sin texto', 'No se detectó texto en la imagen. Intenta con mejor iluminación.');
        return;
      }
      setAttachment(result.text);
      if (!input.trim()) {
        setInput(result.isMath ? 'Explícame paso a paso cómo resolver este ejercicio.' : 'Ayúdame a entender este texto.');
      }
    } catch (e) {
      Alert.alert('Error de OCR', e instanceof Error ? e.message : String(e));
    } finally {
      await cleanupImages();
      setOcrBusy(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) {
      return;
    }
    if (!LlamaService.isReady()) {
      Alert.alert('Sin modelo', 'Primero importa y activa un modelo en el Gestor de Modelos.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir gestor', onPress: () => navigation.navigate('ModelManager') },
      ]);
      return;
    }
    setBusy(true);
    setInput('');
    const currentAttachment = attachment;
    setAttachment(null);
    const tempId = `tmp-${Date.now()}`;
    setMessages(prev => [...prev, { id: tempId, role: 'user', content: text, hasAttachment: !!currentAttachment }]);
    setStreaming('');
    streamBuffer.current = '';
    scrollToEnd();
    try {
      const conv = conversation ?? (await createConversation({ subjectId: subject?.code ?? route.params?.subjectCode ?? null }));
      if (!conversation) {
        setConversation(conv);
      }
      const { droppedMessages } = await sendMessage({
        conversation: conv,
        text,
        attachmentText: currentAttachment ?? undefined,
        useRag,
        subjectName: subject?.name,
        onToken: (_t, full) => {
          streamBuffer.current = full;
          if (!flushTimer.current) {
            flushTimer.current = setTimeout(() => {
              flushTimer.current = null;
              setStreaming(streamBuffer.current);
              scrollToEnd();
            }, 60);
          }
        },
      });
      setMessages((await getMessages(conv.id)).map(toUi));
      if (droppedMessages > 0) {
        console.log(`[Chat] ${droppedMessages} mensajes antiguos quedaron fuera de la ventana de contexto`);
      }
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : String(e));
    } finally {
      if (flushTimer.current) {
        clearTimeout(flushTimer.current);
        flushTimer.current = null;
      }
      setStreaming(null);
      setBusy(false);
      scrollToEnd();
    }
  };

  const renderMessage = ({ item }: { item: UiMessage }) => {
    const mine = item.role === 'user';
    return (
      <View
        style={[
          styles.bubble,
          mine ? styles.mine : styles.theirs,
          { backgroundColor: mine ? colors.userBubble : colors.botBubble, borderColor: colors.border },
        ]}>
        {item.hasAttachment && <Text style={[styles.meta, { color: mine ? '#DDEFE7' : colors.textMuted }]}>📎 Imagen adjunta (OCR)</Text>}
        <Text selectable style={{ color: mine ? colors.userBubbleText : colors.botBubbleText, fontSize: 15, lineHeight: 21 }}>
          {item.content}
        </Text>
        {!!item.sources?.length && (
          <Text style={[styles.meta, { color: colors.textMuted }]}>
            Fuentes: {item.sources.map((s, i) => `[${i + 1}] ${s.source}`).join(' · ')}
          </Text>
        )}
        {!!item.tps && <Text style={[styles.meta, { color: colors.textMuted }]}>{item.tps} tokens/s</Text>}
      </View>
    );
  };

  const data: UiMessage[] = streaming !== null
    ? [...messages, { id: 'streaming', role: 'assistant', content: streaming || '…' }]
    : messages;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}>
      {llm.status !== 'ready' && llm.status !== 'generating' && (
        <Pressable onPress={() => navigation.navigate('ModelManager')} style={[styles.banner, { backgroundColor: colors.warning }]}>
          <Text style={styles.bannerText}>
            {llm.status === 'loading' ? 'Cargando modelo…' : '⚠️ No hay modelo activo. Toca aquí para importarlo.'}
          </Text>
        </Pressable>
      )}
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={m => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>
            Pregunta lo que quieras sobre tus materias. También puedes adjuntar una foto de tu tarea 📷
          </Text>
        }
      />
      {attachment && (
        <View style={[styles.attachment, { backgroundColor: colors.surfaceAlt }]}>
          <Text numberOfLines={2} style={{ color: colors.text, flex: 1 }}>📎 {attachment}</Text>
          <Pressable onPress={() => setAttachment(null)}>
            <Text style={{ color: colors.danger, fontWeight: '700' }}>✕</Text>
          </Pressable>
        </View>
      )}
      <View style={[styles.toolbar, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
        <Pressable onPress={() => attachPhoto('camera')} disabled={ocrBusy || busy} style={styles.iconBtn}>
          {ocrBusy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.icon}>📷</Text>}
        </Pressable>
        <Pressable onPress={() => attachPhoto('gallery')} disabled={ocrBusy || busy} style={styles.iconBtn}>
          <Text style={styles.icon}>🖼️</Text>
        </Pressable>
        <Pressable onPress={() => setUseRag(v => !v)} style={styles.iconBtn}>
          <Text style={[styles.icon, { opacity: useRag ? 1 : 0.35 }]}>📚</Text>
        </Pressable>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Escribe tu pregunta…"
          placeholderTextColor={colors.textMuted}
          multiline
          style={[styles.input, { color: colors.text, backgroundColor: colors.background, borderColor: colors.border }]}
        />
        {busy ? (
          <Pressable onPress={() => LlamaService.stop()} style={[styles.send, { backgroundColor: colors.danger }]}>
            <Text style={styles.sendText}>■</Text>
          </Pressable>
        ) : (
          <Pressable onPress={send} disabled={!input.trim()} style={[styles.send, { backgroundColor: colors.primary, opacity: input.trim() ? 1 : 0.5 }]}>
            <Text style={styles.sendText}>➤</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.md, gap: spacing.sm, flexGrow: 1 },
  bubble: { maxWidth: '88%', borderRadius: radius.lg, padding: spacing.md, borderWidth: StyleSheet.hairlineWidth, gap: 4 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  meta: { fontSize: 11 },
  empty: { textAlign: 'center', marginTop: 80, paddingHorizontal: 30, fontSize: 15, lineHeight: 22 },
  banner: { padding: spacing.sm },
  bannerText: { color: '#FFF', textAlign: 'center', fontWeight: '600' },
  attachment: { flexDirection: 'row', padding: spacing.sm, marginHorizontal: spacing.md, borderRadius: radius.sm, gap: spacing.sm },
  toolbar: { flexDirection: 'row', alignItems: 'flex-end', padding: spacing.sm, gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
  iconBtn: { padding: 8, justifyContent: 'center' },
  icon: { fontSize: 20 },
  input: { flex: 1, maxHeight: 120, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8, fontSize: 15 },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  sendText: { color: '#FFF', fontSize: 18 },
});
