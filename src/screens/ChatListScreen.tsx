import React from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Q } from '@nozbe/watermelondb';
import { Body, Button, Card, Empty } from '../components/ui';
import { collections, type Conversation } from '../db';
import { useFocusData } from '../hooks/useFocusData';
import type { RootStackParamList } from '../navigation/types';
import { deleteConversation } from '../services/chat/ChatService';
import { spacing, useTheme } from '../theme';

export default function ChatListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const [conversations, reload] = useFocusData(
    () => collections.conversations.query(Q.sortBy('updated_at', Q.desc)).fetch() as Promise<Conversation[]>,
    [],
  );

  const confirmDelete = (c: Conversation) =>
    Alert.alert('Eliminar conversación', `¿Eliminar "${c.title}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => { await deleteConversation(c); reload(); } },
    ]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Button label="＋ Nueva conversación" onPress={() => navigation.navigate('Chat', {})} />
      <FlatList
        data={conversations}
        keyExtractor={c => c.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Empty text="Aún no tienes conversaciones." />}
        renderItem={({ item }) => (
          <Card onPress={() => navigation.navigate('Chat', { conversationId: item.id })}>
            <Body style={styles.bold}>{item.title}</Body>
            <View style={styles.meta}>
              <Body muted>{item.updatedAt.toLocaleString('es-MX')}</Body>
              <Button label="Eliminar" variant="ghost" onPress={() => confirmDelete(item)} />
            </View>
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, gap: spacing.md },
  list: { gap: spacing.sm, paddingBottom: 40 },
  bold: { fontWeight: '600' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
