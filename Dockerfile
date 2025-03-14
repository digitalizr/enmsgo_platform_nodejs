# Stage 1: Build
FROM node:18 AS builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Stage 2: Production
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy only the necessary files from the build stage
COPY --from=builder /app .

# Expose port (make sure this matches your app’s port)
EXPOSE 3001

# Start the application
CMD ["node", "server.js"]
