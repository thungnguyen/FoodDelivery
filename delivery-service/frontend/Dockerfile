ARG NODE_IMAGE=node:20-bullseye-slim
ARG NGINX_IMAGE=nginx:alpine
FROM ${NODE_IMAGE} AS build

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM ${NGINX_IMAGE}

COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
