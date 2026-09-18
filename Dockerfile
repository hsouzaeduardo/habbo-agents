# Imagem do Habbo Office.
#
# Nao ha etapa de build: o front e servido como arquivo estatico, entao basta o
# Node com as dependencias de producao (so o Express).

FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# as dependencias em uma camada propria: so refaz o npm ci quando o lock muda
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY public ./public

# O App Service injeta PORT; 3000 e so o padrao de quando roda solto.
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
CMD ["node", "server/index.js"]
