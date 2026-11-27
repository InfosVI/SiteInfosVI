// Bibliothèques du navigateur servies par le site lui-même (aucun service tiers) : copiées depuis node_modules
// au démarrage local (npm run dev) et à la construction (Dockerfile).
import { copyFileSync, mkdirSync } from 'node:fs';
const fichiers = {
  'altcha.js': 'node_modules/altcha/dist/main/altcha.i18n.min.js',
  'd3.min.js': 'node_modules/d3/dist/d3.min.js',
  'topojson.min.js': 'node_modules/topojson/dist/topojson.min.js',
  'jspdf.umd.min.js': 'node_modules/jspdf/dist/jspdf.umd.min.js',
};
mkdirSync('public/lib', { recursive: true });
for (const [nom, source] of Object.entries(fichiers)) copyFileSync(source, `public/lib/${nom}`);
console.log(`Bibliothèques copiées dans public/lib : ${Object.keys(fichiers).join(', ')}`);
