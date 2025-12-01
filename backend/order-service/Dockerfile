ARG NODE_IMAGE=node:20-bullseye-slim
FROM ${NODE_IMAGE}

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 5005

CMD ["npm", "start"]
