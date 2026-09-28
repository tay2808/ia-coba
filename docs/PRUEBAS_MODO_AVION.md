# Pruebas en modo avión estricto (fase 16)

Objetivo: demostrar que **todas** las funciones operan sin ninguna conectividad.

## Preparación

1. Instala el APK de **release** (`./gradlew assembleRelease`); el de debug sí declara `INTERNET` para Metro.
2. Verifica el manifest del APK: `aapt dump permissions app-release.apk` **no** debe listar `android.permission.INTERNET`.
3. Ejecuta `npm run check:offline` (auditoría estática).
4. Copia al teléfono: un modelo `.gguf`, un paquete `.pack`, un PDF escaneado, un DOCX y un TXT.
5. Activa **modo avión** y desactiva Wi-Fi y Bluetooth manualmente. Reinicia el teléfono.

## Casos

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Abrir la app por primera vez | Se instala el currículo base; 28 materias visibles en *Materias* |
| 2 | Importar modelo GGUF | Muestra nombre, cuantización, RAM estimada vs disponible; se activa y carga |
| 3 | Importar un archivo que no es GGUF (p. ej. un PDF renombrado) | Error "no es un modelo GGUF", el archivo se borra |
| 4 | Chat: "¿Qué es la fotosíntesis?" | Respuesta en streaming, tokens/s visibles |
| 5 | Chat largo (> 30 mensajes) | Sigue respondiendo; no hay error de contexto (truncamiento automático) |
| 6 | Detener generación (■) | Se detiene; la respuesta queda marcada "(respuesta detenida)" |
| 7 | Foto de un ejercicio de álgebra | OCR extrae el texto, recorte automático, se propone "Explícame paso a paso…" |
| 8 | Importar PDF escaneado de 5 páginas | Progreso de OCR por página; se indexa; el chat cita el documento como fuente |
| 9 | Importar DOCX y TXT | Se indexan; el archivo original desaparece de la caché |
| 10 | Importar paquete `.pack` | Materias/preguntas/flashcards actualizadas; fragmentos en la base vectorial |
| 11 | Reimportar paquete con versión anterior | Error "ya tienes una versión más reciente" |
| 12 | Humanizador con tono "Estudiante COBAEV" | Texto reescrito sin muletillas de IA; el detector de tono no lo marca como robótico |
| 13 | Quiz de 10 preguntas | Calificación 0–10, revisión de respuestas, historial |
| 14 | Generar 5 preguntas con IA | Se agregan al banco de la materia |
| 15 | Flashcards: "No la sabía" | La tarjeta vuelve al final de la cola |
| 16 | Exportar respaldo | Diálogo del sistema para guardar `.zip`; restaurar en otro teléfono recupera chats |
| 17 | Uso prolongado (15 min de generación continua) | Si el teléfono se calienta, baja hilos/tokens y aplica pausas; no se cierra |
| 18 | Memoria baja (abrir apps pesadas y volver) | Contexto reducido a 1024 sin fallos |

## Verificación de tráfico (opcional)

Con el teléfono conectado por USB y `adb`: `adb shell dumpsys netstats detail | grep mx.cobaev.ia` debe mostrar 0 bytes transmitidos por la app tras la sesión de pruebas.
