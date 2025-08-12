# Use Node.js 20 (latest stable) for better compatibility
FROM node:20-slim

# Set environment variable to fix undici/File issues
ENV NODE_OPTIONS="--no-experimental-fetch"

# Install system dependencies required for Puppeteer/Chrome
RUN apt-get update && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libgtk-4-1 \
    libnspr4 \
    libnss3 \
    libwayland-client0 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Clean npm cache and install dependencies
RUN npm cache clean --force && \
    npm ci --only=production --ignore-scripts

# Copy application code
COPY . .

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --gid 1001 --shell /bin/bash nodejs && \
    mkdir -p /home/nodejs && \
    chown -R nodejs:nodejs /app /home/nodejs

# Switch to non-root user
USER nodejs

# Set environment variables for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "index.js"]