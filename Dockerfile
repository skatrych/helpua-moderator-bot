FROM node:lts-alpine3.17

WORKDIR /usr/src/app

COPY package-lock.json .
COPY package.json .
RUN npm ci
COPY .env .
COPY . .

CMD ["node", "main.js"]
