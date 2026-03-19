FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN VITE_BASE_URL=/garage64/ npm run build

FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html/garage64
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3264
