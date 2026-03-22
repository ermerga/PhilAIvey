# ---------------------------------------------------------------------------
# IMPORTANT: Before building this image, scaffold the React app first:
#   cd frontend
#   npm create vite@latest . -- --template react-ts
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Stage 1 — Build
# Uses Node to install dependencies and compile the React app into static files.
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files first so Docker can cache the npm install layer.
# If only source files change (not dependencies), this layer is reused.
COPY package*.json ./
RUN npm install

# Copy the rest of the source and build
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — Serve
# Copies only the compiled output into a tiny nginx image.
# The final image has no Node, no source code — just the built files.
# ---------------------------------------------------------------------------
FROM nginx:alpine

# Copy compiled React app from the builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy our custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
