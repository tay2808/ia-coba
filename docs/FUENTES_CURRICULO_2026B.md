# Fuentes del currículo 2026-B

Documentos que respaldan `assets/curriculum/cobaev-2026b-base.json` y las carpetas fuente de
`tools/sources/2026b/`. Semestre **2026-B** (31 de agosto de 2026 – 19 de enero de 2027):

| Semestre | Generación | Modelo |
|---|---|---|
| 1.º | 2026-2029 | Modelo Educativo 2025 |
| 3.º | 2025-2028 | Modelo Educativo 2025 |
| 5.º | 2024-2027 | MCCEMS 2023 |

Consulta realizada el **29 de septiembre de 2026**.

## Documentos usados

### 1. Campus Virtual COBAEV – categoría "2026-B"

- URL: http://campuscobaev.veracruz.gob.mx/moodle2020/course/index.php?categoryid=219
- Publica COBAEV. La categoría "2026-B" tiene las subcategorías Primer Semestre (220),
  Tercer Semestre (221), Quinto Semestre (222: Fundamental Básico 224 y Fundamental Extendido 225)
  y Artes (226).
- **Uso**: los **nombres exactos** de las UAC de 1.º, 3.º y 5.º semestre se tomaron de esta lista.
  Solo se normalizaron mayúsculas y espacios (p. ej. "Pensamiento Filosófico Y Humanidades I" →
  "… y Humanidades I"; "Ciencias Sociales I.Estado" → "Ciencias Sociales I. Estado";
  "Conciencia Histórica II, México durante el expansionismo Capitalista" se escribió como en el mapa DGB).
- El contenido de los cursos pide iniciar sesión y el acceso de invitado no está habilitado. Solo se usó
  el **resumen público** de cada curso (`course/info.php?id=N`).

Resúmenes públicos usados como texto fuente. Se copiaron a `tools/sources/2026b/sN/docs/<id>/`
sin nombres de docentes:

| id | UAC | Curso | Fecha o ciclo que indica el texto |
|---|---|---|---|
| lab-inv | Laboratorio de Investigación | 617 | Encabezado "Periodo: 2025-B", pero el texto dice "El semestre 2026-B…" y está en la categoría 2026-B > Primer Semestre (ver notas) |
| hum-3 | Humanidades III | 622 | "Semestre 2026-B" |
| ing-3 | Inglés III | 623 | "2026 B" |
| pm-3 | Pensamiento Matemático III | 625 | "2026-B"; parciales 09/10/2026, 23/11/2026, 19/01/2027 |
| cn-3 | Ecosistemas: Interacciones, Energía y Dinámica | 626 | Examen del 22 al 28 de septiembre de 2026 |
| cn-5 | La energía en los procesos de la vida diaria | 628 | "Semestre 2026-B", 31/08/2026 – 19/01/2027 |
| psic-1 | Psicología I | 629 | "Semestre 2026-B" |
| eco-1 | Economía I. La Función de los Agentes Económicos en la Sociedad | 630 | "2026-B". Las progresiones se transcribieron de las dos imágenes del resumen |
| com-soc-1 | Comunicación y Sociedad I | 631 | "2026-B" |
| der-soc-1 | Derecho y Sociedad I | 632 | "Semestre: 2026-B", "Estudiantes de quinto semestre" (ver notas) |
| tpv-1 | Taller de Pensamiento Variacional I | 633 | "2026-B"; parciales 09/10/2026, 23/11/2026, 18/01/2027 |
| pro-cont-1 | Procesos Contables I | 634 | "2026-B" |
| fund-adm-1 | Fundamentos de Administración I | 635 | Sin fecha en el texto. Está en la categoría 2026-B > Quinto Semestre > Fundamental Extendido |
| afpb-1 | Análisis de Fenómenos y Procesos Biológicos | 640 | Sin fecha en el texto. Está en la categoría 2026-B > Quinto Semestre > Fundamental Extendido |
| tscs-1 | Temas Selectos de Ciencias Sociales I | 641 | "Semestre: 2026-B", "Estudiantes de quinto semestre" (categoría Artes) |

UAC que se incluyeron solo con su nombre, porque su resumen público no tiene contenido curricular:

- **1.º**: Lengua y Comunicación I (621), Inglés I (614), Pensamiento Matemático I (620),
  Cultura Digital I (615), Ciencias Naturales, Experimentales y Tecnología I (619),
  Pensamiento Filosófico y Humanidades I (616) y Ciencias Sociales I (618).
  El resumen de Ciencias Sociales I solo explica cómo usar el repositorio.
- **3.º**: Lengua y Comunicación III (624) y Taller de Ciencias II (643).
- **5.º**: Conciencia Histórica II (627), Organización del Flujo de Materia y Energía en los
  Organismos I (637), Análisis de Fenómenos Físicos I (638), Dibujo Técnico I (636) y
  Salud Integral I (639).

### 2. Estructura General del Mapa Curricular (MCCEMS, DGB)

- URL: http://www.cobaev.edu.mx/docentes/ESTRUCTURA_GENERAL_MAPA_CURRICULAR_MCCEMS.pdf
  (enlazado desde http://www.cobaev.edu.mx/docentes/MapasCurriculares.php y
  http://www.cobaev.edu.mx/docentes/CurriculaSubsecuentes.php)
- Título: *Subsecretaría de Educación Media Superior. Marco Curricular Común de la Educación Media
  Superior. Estructura curricular del plan de estudios de la DGB. Bachillerato, con formación
  ocupacional básica. Educación presencial de la modalidad escolarizada. Junio de 2024.*
  Tiene 2 páginas escaneadas, sin capa de texto.
- Fecha del servidor (Last-Modified): 2 de diciembre de 2024.
- COBAEV lo publica bajo el rótulo **"GENERACIÓN 2023-2026 y Subsecuentes"**. Por eso aplica a la
  generación 2024-2027 (5.º semestre en 2026-B).
- **Uso**:
  - Horas y créditos de las UAC de 5.º semestre. La descripción de cada UAC los cita.
  - Transcripciones de las columnas de 3.º y 5.º semestre en
    `tools/sources/2026b/s3/docs/` y `tools/sources/2026b/s5/docs/`.
  - Para 3.º semestre no se copiaron horas al currículo base. La generación 2025-2028 cursa el
    Modelo Educativo 2025 y no se pudo verificar su programa en la DGB (ver pendientes). Aun así,
    los seis nombres de UAC del Campus 2026-B coinciden con los del mapa.

## Documentos descartados

| Documento | Motivo |
|---|---|
| Mapa Curricular Bachillerato General 2017 (`visor.php?url=docentes/MapaCurricular2017`) | Plan anterior al MCCEMS; no aplica a 2026-B |
| Mapa EMSAD 2017 (`docentes/MapaEMSAD2017`) | Otro plan y otra modalidad |
| RIEMS 2016 (`riems.php`, `docentes/riems2016/*`, `docentes/riems/TERCER_SEMESTRE/*.pdf`) | Reforma anterior; no aplica a 2026-B |
| Bachillerato en Artes 2011 (`docentes/mapacuarte2011`) | Plan anterior |
| Curso "Arte y Cultura I" (Campus, categoría 2026-B > Artes, id 642) | No dice a qué semestre pertenece y su resumen está vacío. Se descartó porque no se puede confirmar que sea de 1.º, 3.º o 5.º |
| Resumen de "Ciencias Sociales I" (id 618) como contenido | Solo explica cómo usar el repositorio. Se usó el nombre de la UAC, pero el texto no se incluyó en el RAG |
| Libros de apuntesacademicos.cobaev.edu.mx | Son publicaciones docentes (Nueva Escuela Mexicana, Cultura Digital en el MCCEMS, etc.), no guías ni programas de un semestre concreto |
| Páginas de "Colegio de Bachilleres" en gob.mx (Plan 2025, programas vigentes) | Son de otra institución (Colegio de Bachilleres de la Ciudad de México), no de COBAEV |

## Pendiente (sin acceso desde el entorno de construcción)

- **dgb.sep.gob.mx** responde **HTTP 403 de Cloudflare** ("Sorry, you have been blocked. You are
  unable to access sep.gob.mx"). Pasa con curl, con WebFetch y con Chromium sin interfaz.
  La réplica web.archive.org está bloqueada por la política de red. **No se usó ningún documento
  de la DGB salvo el mapa que COBAEV publica en su propio sitio.** Documentos identificados pero
  no descargados:
  - Programas de Estudio para la Generación 2025-2028 y Subsecuentes, MCCEMS 2025:
    https://dgb.sep.gob.mx/programas-de-estudio
  - Mapas curriculares: https://dgb.sep.gob.mx/mapas-curriculares y
    https://dgb.sep.gob.mx/mapa-curricular-oficial-del-bachillerato-general
  - Documento Base para el Bachillerato General:
    https://dgb.sep.gob.mx/storage/recursos/2024/02/FsPNWZjKIZ-Documento%20Base%20para%20el%20Bachillerato%20General.pdf
- **Guías pedagógicas en PDF**: no se encontró una sección pública con guías 2026-B en
  www.cobaev.edu.mx. Los cursos del Campus Virtual necesitan una cuenta de estudiante o docente.
- **Mapa curricular del Modelo Educativo 2025** (1.º y 3.º semestre): COBAEV no lo publica en
  Mapas Curriculares. Los nombres de 1.º semestre del Campus 2026-B (p. ej. "Pensamiento
  Matemático I. Pensamiento Aritmético") no aparecen en el mapa DGB de junio de 2024.
- Faltan unidades y progresiones de las UAC que solo tienen nombre, y horas y créditos de 1.º y
  3.º semestre. Se completarán cuando haya programas o guías oficiales de 2026-B.
- **Embeddings**: los `.pack` se construyeron con `--no-embeddings` porque huggingface.co no es
  accesible. La app genera los embeddings en el teléfono al importar.

## Notas de consistencia

- **Laboratorio de Investigación**: el encabezado dice "Periodo: 2025-B", pero el texto habla del
  "semestre 2026-B" y el curso está en la categoría 2026-B. Se usó.
- **Derecho y Sociedad I**: una frase dice "Durante el cuarto semestre…", pero el curso está en
  2026-B > Quinto Semestre > Fundamental Extendido y se dirige a "Estudiantes de quinto semestre".
  Se registró como 5.º semestre.

## Reconstrucción

```bash
python tools/build_curriculum_pack.py tools/sources/2026b/s1 -o build/packs/cobaev-2026b-s1.pack --no-embeddings
python tools/build_curriculum_pack.py tools/sources/2026b/s3 -o build/packs/cobaev-2026b-s3.pack --no-embeddings
python tools/build_curriculum_pack.py tools/sources/2026b/s5 -o build/packs/cobaev-2026b-s5.pack --no-embeddings
```

Si hay red a PyPI y a huggingface.co, quita `--no-embeddings` para incluir embeddings precalculados.
Los paquetes tienen `subjects.json` vacío y `linkedSubjects` apuntando al currículo base. Solo
añaden fragmentos para el RAG, ligados a los ids de materia del currículo base.
