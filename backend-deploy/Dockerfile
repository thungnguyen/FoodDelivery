FROM node:18-alpine

WORKDIR /app

COPY backend-deploy/package.json .
RUN npm install

COPY backend-deploy/. .
COPY backend /app/backend
COPY frontend/build /app/frontend/build

EXPOSE 8080

CMD ["npm", "start"]
