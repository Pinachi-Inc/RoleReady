# 🚀 Node.js Development with Docker Compose

This project runs the Node.js app inside a container, but keeps **live-reload** working by mounting your code into the container. Dependencies are installed inside the container so they match the container’s OS, and your existing `npm start` handles process restarts automatically.

---

## 📂 Files
- `docker-compose.yml` – compose config for development
- `Dockerfile.dev` (optional) – custom build, if you need a dev image later

---

## ▶️ Usage

### 1. Start the app
From the folder containing `docker-compose.yml`:

```bash
docker compose up --build
```

- Your app runs inside the container.
- Source code changes on your host are reflected immediately (thanks to volume mounts).
- Your `npm start` script (with `concurrently`, `nodemon`, etc.) handles hot reload.

---

### 2. Install dependencies (first run)
If `node_modules` is empty, install once inside the container:

```bash
docker compose run --rm app npm ci
```

This installs both `dependencies` and `devDependencies` into the container’s `node_modules` volume.

---

### 3. Stop the app
```bash
docker compose down
```

This stops and removes the container (but keeps your `node_modules` volume).

---

### 4. Reset dependencies
If you need a clean reinstall of all dependencies:

```bash
docker compose down
docker volume rm $(docker volume ls -q | grep app-node_modules || true)
docker compose run --rm app npm ci
```

---

## 🔧 Ports & Debugging
- App is exposed on **localhost:3000** (changeable in `docker-compose.yml`).
- To enable Node.js inspector debugging:
  1. Uncomment port `9229:9229` in `docker-compose.yml`
  2. Add `--inspect=0.0.0.0:9229` to your start script in `package.json`

---

## ⚡ Tips
- **File watching**: On macOS/Windows, we set `CHOKIDAR_USEPOLLING=true` for reliable hot reload.
- **Dev vs Prod**: In production builds, use a `Dockerfile` with:
  ```dockerfile
  RUN npm ci --omit=dev
  ```
  to exclude dev dependencies.
- **Anonymous node_modules volume**: Keeps dependencies isolated in the container and avoids host/OS mismatch.

---

✅ With this setup, you edit code on your host → container reloads automatically → dependencies are always consistent with the container environment.
