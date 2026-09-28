/**
 * COBAEV IA — asistente educativo 100% offline.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/navigation/AppNavigator';
import { installBaseCurriculumIfNeeded } from './src/services/curriculum/CurriculumImporter';
import { clearTemp, ensureDirs } from './src/services/fileSystem';
import { loadActiveModel, registerBundledModels } from './src/services/models/ModelManager';
import { useTheme } from './src/theme';

async function bootstrap(): Promise<void> {
  await ensureDirs();
  // Privacidad: elimina restos de documentos/fotos de sesiones anteriores.
  await clearTemp();
  await installBaseCurriculumIfNeeded();
}

export default function App() {
  const { colors, dark } = useTheme();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bootstrap()
      .then(() => {
        setReady(true);
        // El modelo se carga en segundo plano para no bloquear la interfaz.
        registerBundledModels()
          .then(loadActiveModel)
          .catch(e => console.warn('[App] No se pudo cargar el modelo activo', e));
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      {ready ? (
        <AppNavigator />
      ) : (
        <View style={[styles.splash, { backgroundColor: colors.background }]}>
          <Text style={[styles.title, { color: colors.primary }]}>COBAEV IA</Text>
          {error ? (
            <Text style={{ color: colors.danger, textAlign: 'center' }}>Error al iniciar: {error}</Text>
          ) : (
            <ActivityIndicator color={colors.primary} />
          )}
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  title: { fontSize: 32, fontWeight: '800' },
});
