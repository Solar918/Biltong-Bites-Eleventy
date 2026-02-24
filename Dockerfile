# Stage 1: Build the Eleventy site
FROM node:18-alpine AS builder
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Serve with Python
FROM python:3.12-slim
WORKDIR /app

# Copy the built site from the builder stage
COPY --from=builder /app/_site /app/_site
# Copy backend script and email templates
COPY serve.py email_template.md order_complete_template.md contact_template.md /app/

# Create a volume mount point for the database to persist orders
VOLUME /app/data

# Expose the port the server runs on
EXPOSE 8000

# Environment variables can be passed at runtime (e.g., SMTP settings)
# Start the server on port 8000
CMD ["python", "serve.py", "8000"]
