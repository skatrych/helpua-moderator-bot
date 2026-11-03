FROM node:lts-alpine3.17

WORKDIR /usr/src/app

COPY . .
RUN npm ci

CMD ["node", "main.js"]
