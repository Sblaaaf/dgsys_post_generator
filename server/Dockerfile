# Node 20 LTS, image slim : ~180 Mo au lieu de ~1 Go pour l'image complète.
FROM node:20-alpine

WORKDIR /app

# Les dépendances sont copiées seules d'abord : tant que package.json ne change
# pas, Docker réutilise le cache de cette couche et le build reste instantané.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY index.js ./

ENV NODE_ENV=production
ENV PORT=8787
EXPOSE 8787

# Utilisateur non-root : une faille dans le process ne donne pas la main sur le conteneur.
USER node

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "index.js"]
