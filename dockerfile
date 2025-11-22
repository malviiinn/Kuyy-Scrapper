# Gunakan image Node 20 dari Apify (ringan, tanpa browser)
FROM apify/actor-node:20

# Set working directory
WORKDIR /usr/src/app

# Salin file manifest & install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Salin seluruh source code
COPY . ./

# (Opsional) cek versi
RUN node -v && npm -v

# Command default (Apify akan override saat run)
CMD ["node", "main.js"]
