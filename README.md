# BetterKahoots

## Deploying to Azure Web Apps for Containers

Azure App Service expects containerized applications to listen on a single
public port and does not support building images from a `docker-compose.yml`
file. To deploy this project:

1. Build and push the backend and frontend images to a container registry:

   ```bash
   docker build -t <registry>/betterkahoots-backend:latest ./backend
   docker build -t <registry>/betterkahoots-frontend:latest ./frontend
   docker push <registry>/betterkahoots-backend:latest
   docker push <registry>/betterkahoots-frontend:latest
   ```

2. Configure your App Service with the following settings:

   - `WEBSITES_PORT=8000` (or set `PORT` to the desired value when running the
     backend container).
   - Environment variables required by the backend, such as `MONGO_URI`,
     `MONGO_DB`, `ADMIN_KEY`, and `CORS_ORIGINS`.

3. Update the compose deployment to reference the pushed images. The provided
   `docker-compose.yml` supports overriding the image names via environment
   variables (`BACKEND_IMAGE` and `FRONTEND_IMAGE`) so you can reuse the file
   locally and in Azure.

Only the frontend exposes port 80 publicly. The backend and MongoDB services
communicate internally using the container network.
