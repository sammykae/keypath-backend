# Base image Node 20
FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Compile TypeScript to dist/
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]
