
# BetterKahoots

## Deployment overview

BetterKahoots is split between a React front end and a FastAPI backend.
For Azure hosting:

- **Frontend** – deploy the `frontend` build output to **Azure Static Web Apps (SWA)**.
- **Backend** – run the container image from `backend` in **Azure App Service for Containers**.
- **Database** – connect the backend to your **MongoDB Atlas** cluster via environment variables.

The sections below outline the required configuration.

## Backend (Azure App Service for Containers)

1. Build and push the backend image to your container registry:

   ```bash
   docker build -t <registry>/betterkahoots-backend:latest ./backend
   docker push <registry>/betterkahoots-backend:latest
   ```

2. Create an App Service for Containers instance and configure it to pull the image.
3. Set the following App Service settings:
   - `WEBSITES_PORT=8000` so App Service routes traffic to Uvicorn.
   - `PORT=8000` (optional but keeps local and cloud configs consistent).
   - `MONGO_URI` – the MongoDB Atlas connection string (for example `mongodb+srv://...`).
   - `MONGO_DB=betterkahoots` or your chosen database name.
   - `ADMIN_KEY` – the value used to protect admin routes.
   - `CORS_ORIGINS` – include your SWA hostname (for example `https://<your-app>.azurestaticapps.net`).

The backend already honours the `PORT` variable and exposes 8000 in the Dockerfile, so no
further code changes are required for App Service.

## Frontend (Azure Static Web Apps)

1. Install dependencies and produce a production build:

   ```bash
   cd frontend
   npm install
   npm run build
   ```

   The build artefacts are written to `frontend/dist`.

2. When configuring your SWA app, point the **App location** to `frontend`, the **Output location**
   to `dist`, and leave the API location empty (the API is hosted separately).
3. Expose the backend URL to the frontend by setting a static web app secret `VITE_API_BASE_URL`
   to the HTTPS endpoint of your App Service instance (for example `https://betterkahoots-api.azurewebsites.net`).
4. The included `frontend/staticwebapp.config.json` configures SPA fallback routing so client-side
   routes resolve correctly.

## MongoDB Atlas configuration

1. Create a MongoDB Atlas cluster and database for BetterKahoots.
2. Generate a database user with the necessary permissions and capture the SRV connection string.
3. Update the backend `MONGO_URI` setting (environment variable or `.env` file) with the Atlas
   connection string. The backend uses TLS by default when presented with an Atlas URI.

## Local development

- Copy `.env` and set it to match your Atlas cluster (or override with another MongoDB URI).
- Start the backend container locally:

  ```bash
  docker compose up -d
  ```

  The API is available on `http://localhost:8000`.

- Run the frontend using Vite's dev server:

  ```bash
  cd frontend
  npm install
  npm run dev -- --host
  ```

  Set `VITE_API_BASE_URL=http://localhost:8000` when running the frontend locally so it targets the
  Docker hosted backend.
