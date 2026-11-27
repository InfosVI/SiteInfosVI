# Image du site (cible « site ») et image des tâches (cible « outils » : collecte, migrations, chargement des données)
# Construite par GitHub Actions et publiée sur le registre GitHub ; le serveur ne fait que la télécharger.

FROM node:26-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild esbuild

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Widget du captcha ALTCHA, servi par le site lui-même (aucun service tiers)
RUN cp node_modules/altcha/dist/main/altcha.i18n.min.js public/altcha.js && npx next build

# ---------- Site : uniquement ce qui sert à afficher les pages ----------
FROM node:26-bookworm-slim AS site
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
# Repère du code (affiché sur l'aperçu à côté du numéro de version)
ARG GIT_SHA=""
ENV GIT_SHA=$GIT_SHA
RUN groupadd -r app && useradd -r -g app app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/content ./content
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/data').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]

# ---------- Outils : collecte quotidienne, migrations, chargement des données publiques ----------
FROM node:26-bookworm-slim AS outils
WORKDIR /app
ENV NODE_ENV=production
RUN groupadd -r app && useradd -r -g app app
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package.json tsconfig.json ./
COPY --chown=app:app lib ./lib
COPY --chown=app:app scripts ./scripts
COPY --chown=app:app data ./data
USER app
CMD ["npx", "tsx", "scripts/collecte.ts"]
