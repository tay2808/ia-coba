import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import type { RootStackParamList, TabParamList } from './types';
import HomeScreen from '../screens/HomeScreen';
import ChatListScreen from '../screens/ChatListScreen';
import ChatScreen from '../screens/ChatScreen';
import SubjectsScreen from '../screens/SubjectsScreen';
import SubjectDetailScreen from '../screens/SubjectDetailScreen';
import ToolsScreen from '../screens/ToolsScreen';
import ModelManagerScreen from '../screens/ModelManagerScreen';
import DocumentsScreen from '../screens/DocumentsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import HumanizerScreen from '../screens/tools/HumanizerScreen';
import CorrectionScreen from '../screens/tools/CorrectionScreen';
import ToneDetectorScreen from '../screens/tools/ToneDetectorScreen';
import ExplainerScreen from '../screens/tools/ExplainerScreen';
import QuizScreen from '../screens/tools/QuizScreen';
import FlashcardsScreen from '../screens/tools/FlashcardsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, string> = {
  Inicio: '🏠',
  Conversaciones: '💬',
  Materias: '📚',
  Herramientas: '🧰',
};

function TabIcon({ name, focused }: { name: keyof TabParamList; focused: boolean }) {
  return <Text style={[styles.tabIcon, !focused && styles.tabIconInactive]}>{TAB_ICONS[name]}</Text>;
}

function Tabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        tabBarIcon: ({ focused }) => TabIcon({ name: route.name, focused }),
      })}>
      <Tab.Screen name="Inicio" component={HomeScreen} options={{ title: 'COBAEV IA' }} />
      <Tab.Screen name="Conversaciones" component={ChatListScreen} options={{ tabBarLabel: 'Chat' }} />
      <Tab.Screen name="Materias" component={SubjectsScreen} />
      <Tab.Screen name="Herramientas" component={ToolsScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { colors, dark } = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;
  return (
    <NavigationContainer
      theme={{ ...base, colors: { ...base.colors, primary: colors.primary, background: colors.background, card: colors.surface, text: colors.text, border: colors.border } }}>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.text }}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="Chat" component={ChatScreen} options={{ title: 'Chat' }} />
        <Stack.Screen name="SubjectDetail" component={SubjectDetailScreen} options={{ title: 'Materia' }} />
        <Stack.Screen name="Quiz" component={QuizScreen} options={{ title: 'Quiz' }} />
        <Stack.Screen name="Flashcards" component={FlashcardsScreen} options={{ title: 'Flashcards' }} />
        <Stack.Screen name="Humanizer" component={HumanizerScreen} options={{ title: 'Humanizador de textos' }} />
        <Stack.Screen name="Correction" component={CorrectionScreen} options={{ title: 'Corrección de redacción' }} />
        <Stack.Screen name="ToneDetector" component={ToneDetectorScreen} options={{ title: 'Detector de tono' }} />
        <Stack.Screen name="Explainer" component={ExplainerScreen} options={{ title: 'Explicador paso a paso' }} />
        <Stack.Screen name="ModelManager" component={ModelManagerScreen} options={{ title: 'Gestor de modelos' }} />
        <Stack.Screen name="Documents" component={DocumentsScreen} options={{ title: 'Mis documentos' }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Ajustes y privacidad' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabIcon: { fontSize: 20 },
  tabIconInactive: { opacity: 0.6 },
});
