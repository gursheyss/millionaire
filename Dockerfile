FROM node:20-alpine AS build
WORKDIR /app
COPY control/package*.json control/
RUN npm --prefix control ci
COPY control control
RUN npm --prefix control run build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
COPY --from=build /app/public/control public/control
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
