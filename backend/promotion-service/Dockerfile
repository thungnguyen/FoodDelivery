ARG NODE_IMAGE=node:20-bullseye-slim
FROM ${NODE_IMAGE}

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 5006
CMD ["npm", "start"]
