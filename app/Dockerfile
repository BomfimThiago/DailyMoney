FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# EXPO_PUBLIC_* values are baked into the bundle at build time.
ARG EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=""
ENV EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=$EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID EXPO_PUBLIC_API_URL=""
RUN npx expo export --platform web --output-dir dist

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
