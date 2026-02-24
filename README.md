# Interactive Eleventy Portfolio

An accessible, highly interactive personal portfolio built with Eleventy (11ty), plain HTML/CSS/JS, and content-driven projects.

## Quick start

1. Install Node.js (18+):
   - macOS: `brew install node`
   - Ubuntu/Debian: `curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs`
   - Fedora/RHEL: `sudo dnf module install nodejs:18`
   - Windows: Download and run installer from https://nodejs.org/
2. Install deps: `npm install`.
3. Run local dev server: `npm run dev`.
4. Build for production: `npm run build` (outputs to `_site`).
5. Serve production build: `python3 serve.py [port]` (default port 8000).

### Alternative (no local npm)
6. Install Eleventy globally: `npm install -g @11ty/eleventy`.
7. Build without `npm run`: `eleventy` (outputs to `_site`).
8. Serve with Python: `python3 serve.py [port]`.

## Content model

- Projects live in `src/projects/*.md` with front matter: `title`, `description`, `tech`, `url`, `repo`, `image`, `date`.
- Site-wide metadata in `src/_data/site.json`.

## Features

- Dark/light theme with toggle and `prefers-color-scheme` support
- Client-side project filtering (by tech) and search
- On-scroll animations respecting `prefers-reduced-motion`
- Keyboard-accessible modal for project details
- SEO metadata, sitemap, and social tags

## Self-Hosting & Deployment

Since this project now includes a **Python backend** (`serve.py`) with an SQLite database (`orders.db`) for processing orders, it must be hosted on a server that supports Python, rather than a static purely frontend host (like Cloudflare Pages or GitHub Pages alone).

### Option 1: Docker (Recommended)

A `Dockerfile` is provided to easily self-host the application using a multi-stage build (Node.js for the frontend, Python for the backend).

1. Build the Docker image:
   ```bash
   docker build -t biltong-bites .
   ```
2. Run the container:
   When running the container, ensure you pass your `.env` variables and mount a volume for the database so your orders persist across container restarts. First, modify `serve.py` if necessary to save `orders.db` to the `/app/data` volume, OR mount the current directory so the DB saves locally.
   
   ```bash
   docker run -d \
     -p 8000:8000 \
     --env-file .env \
     -v $(pwd)/orders.db:/app/orders.db \
     --name biltong-bites-app \
     biltong-bites
   ```

### Option 2: Python VPS (DigitalOcean, Linode, etc.)

You can host this directly on a Linux VPS by running the server as a background service.

1. Clone the repository to your server.
2. Install Node.js and run `npm install` followed by `npm run build` to generate the `_site/` directory.
3. Add your `.env` file with the SMTP and bank details.
4. Run the Python server using a process manager like `pm2`, `systemd`, or `nohup`:
   ```bash
   nohup python3 serve.py 8000 &
   ```
   *(For production, it is highly recommended to put `serve.py` behind a reverse proxy like **Nginx** or **Caddy** with an SSL certificate for HTTPS).*

### Integrating with Static Hosts (Split Hosting)

If you prefer to host the frontend on a static platform (Cloudflare Pages, Vercel, Netlify), you can:
1. Deploy the frontend repository to the static host.
2. Deploy the Python backend (`serve.py`) to a service like Render or RailWay.
3. Update `src/assets/scripts/main.js` to point the `fetch('/api/orders')` request to your new backend URL instead of a relative path.
