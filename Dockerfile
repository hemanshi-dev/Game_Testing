
FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV HEADLESS=true

CMD ["npm", "start"]
