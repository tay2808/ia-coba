#!/usr/bin/env node
/**
 * Auditoría estática del modo offline estricto (fase 16 del plan).
 * Falla si el código de la app usa APIs de red o si el manifest de
 * producción declara el permiso de internet.
 *
 *   node tools/check_offline.js
 *
 * Complementa (no sustituye) las pruebas manuales en modo avión descritas
 * en docs/PRUEBAS_MODO_AVION.md.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIRS = ['src', 'App.tsx', 'index.js'];

const FORBIDDEN = [
  // fetch global (no métodos como `query().fetch()` de WatermelonDB).
  { re: /(?<![.\w])fetch\s*\(/, why: 'llamada fetch()' },
  { re: /\bXMLHttpRequest\b/, why: 'XMLHttpRequest' },
  { re: /\bWebSocket\b/, why: 'WebSocket' },
  { re: /\bEventSource\b/, why: 'EventSource' },
  { re: /https?:\/\/(?!schemas\.android\.com)/, why: 'URL remota' },
  { re: /\bdownloadFile\s*\(/, why: 'descarga de archivos' },
  { re: /\buploadFiles\s*\(/, why: 'subida de archivos' },
  { re: /firebase|openai|analytics|sentry|crashlytics/i, why: 'servicio en la nube/telemetría' },
];

const FORBIDDEN_DEPS = /firebase|openai|analytics|sentry|crashlytics|amplitude|mixpanel|segment/i;

function walk(p, out = []) {
  const full = path.join(ROOT, p);
  if (!fs.existsSync(full)) {
    return out;
  }
  if (fs.statSync(full).isDirectory()) {
    for (const f of fs.readdirSync(full)) {
      walk(path.join(p, f), out);
    }
  } else if (/\.(ts|tsx|js)$/.test(p)) {
    out.push(p);
  }
  return out;
}

const problems = [];

for (const file of SRC_DIRS.flatMap(d => walk(d))) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '');
    for (const { re, why } of FORBIDDEN) {
      if (re.test(code)) {
        problems.push(`${file}:${i + 1}  ${why}: ${line.trim()}`);
      }
    }
  });
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
for (const dep of Object.keys(pkg.dependencies ?? {})) {
  if (FORBIDDEN_DEPS.test(dep)) {
    problems.push(`package.json  dependencia de red/telemetría: ${dep}`);
  }
}

const manifest = fs.readFileSync(path.join(ROOT, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
const internet = manifest.match(/<uses-permission[^>]*android\.permission\.INTERNET[^>]*>/g) ?? [];
if (!internet.length || internet.some(tag => !/tools:node="remove"/.test(tag))) {
  problems.push('AndroidManifest.xml (main): el permiso INTERNET debe declararse con tools:node="remove"');
}

if (problems.length) {
  console.error('❌ Se encontraron posibles accesos a red:\n');
  problems.forEach(p => console.error('  ' + p));
  process.exit(1);
}
console.log('✅ Auditoría offline superada: sin APIs de red en el código y sin permiso INTERNET en producción.');
