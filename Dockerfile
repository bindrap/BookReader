# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create directories for user data
RUN mkdir -p /app/user_books

# Expose the application port
EXPOSE 8669

# Set environment variables
ENV NODE_ENV=production
ENV JWT_SECRET=change-this-secret-in-production

# Start the application
CMD ["node", "server.js"]
