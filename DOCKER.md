# BookReader - Docker Guide

## Quick Start

Run BookReader with a single command:

```bash
docker compose up -d
```

Access the application at `http://localhost:8669`

## What Gets Created

When you run Docker Compose, the following happens:

1. **Docker Image Built** - A containerized version of BookReader is created
2. **Container Started** - The application runs in an isolated environment
3. **Data Persistence** - Two things are mounted from your host machine:
   - `./user_books/` - All uploaded books and cover settings
   - `./users.json` - User accounts database

## Common Commands

### Start the application
```bash
docker compose up -d
```

### Stop the application
```bash
docker compose down
```

### View logs
```bash
docker compose logs -f
```

### Restart the application
```bash
docker compose restart
```

### Update to latest version
```bash
# Pull latest code from git (if applicable)
git pull

# Rebuild and restart
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Remove everything (including data)
```bash
# Stop and remove containers
docker compose down

# Remove user data (WARNING: This deletes all books and users!)
rm -rf user_books/
rm users.json
```

## Data Persistence

### Where is my data?

All your data is stored on your host machine in these locations:

- **Books**: `user_books/[user-id]/` - Each user's uploaded books
- **Users**: `users.json` - User accounts and passwords
- **Cover Settings**: `user_books/[user-id]/.cover-settings.json` - Which page to use as cover

### Backing up your data

Simply copy these files/folders:

```bash
# Create a backup
cp -r user_books/ user_books_backup/
cp users.json users_backup.json

# Or create a tar archive
tar -czf bookreader-backup-$(date +%Y%m%d).tar.gz user_books/ users.json
```

### Restoring from backup

```bash
# Stop the application
docker compose down

# Restore files
cp -r user_books_backup/* user_books/
cp users_backup.json users.json

# Restart
docker compose up -d
```

## Configuration

### Changing the JWT Secret

For production use, you should change the JWT secret:

1. Create a `.env` file in the project root:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and set a secure random string:
   ```
   JWT_SECRET=your-very-secure-random-string-here
   ```

3. Restart the application:
   ```bash
   docker compose down
   docker compose up -d
   ```

**Note**: Changing the JWT secret will invalidate all existing login sessions.

### Changing the Port

To run on a different port, edit `docker-compose.yml`:

```yaml
ports:
  - "3000:8669"  # Change 3000 to your desired port
```

Then restart:
```bash
docker compose down
docker compose up -d
```

## Troubleshooting

### Port already in use

If you see an error about port 8669 being in use:

1. Check what's using the port:
   ```bash
   # Linux/Mac
   lsof -i :8669

   # Windows
   netstat -ano | findstr :8669
   ```

2. Either stop the other application or change the port in `docker-compose.yml`

### Container won't start

Check the logs:
```bash
docker compose logs
```

Common issues:
- **Permission errors**: Make sure Docker has permission to access the project directory
- **Port conflicts**: Another application is using port 8669

### Can't access the application

1. Verify the container is running:
   ```bash
   docker compose ps
   ```

2. Check if the health check is passing:
   ```bash
   docker compose ps
   ```
   Look for "healthy" status

3. Try accessing directly:
   ```bash
   curl http://localhost:8669
   ```

### Reset everything

If something goes wrong and you want to start fresh:

```bash
# Stop and remove containers
docker compose down

# Remove the Docker image
docker rmi bookreader

# (Optional) Remove all data
rm -rf user_books/
rm users.json

# Start fresh
docker compose up -d
```

## Multi-Platform Support

The Docker setup works on:

- **Linux** (x86_64, ARM64)
- **macOS** (Intel, Apple Silicon)
- **Windows** (with WSL2)

The Node.js Alpine image is automatically built for your platform.

## Security Notes

1. **Change JWT Secret**: Always set a custom JWT_SECRET in production
2. **Use HTTPS**: In production, put BookReader behind a reverse proxy with SSL
3. **Firewall**: Only expose port 8669 to trusted networks
4. **Backups**: Regularly backup your `user_books/` and `users.json`
5. **Updates**: Keep the Docker base image updated by rebuilding periodically

## Production Deployment

For production use, consider:

1. **Reverse Proxy**: Use Nginx or Traefik with SSL certificates
2. **Environment Variables**: Use Docker secrets or a secure .env file
3. **Monitoring**: Add logging and monitoring tools
4. **Backups**: Set up automated backups of user data
5. **Resource Limits**: Add memory and CPU limits to the container

Example with resource limits:

```yaml
services:
  bookreader:
    # ... other settings ...
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

## Support

For issues, check:
1. Container logs: `docker compose logs`
2. Application logs inside container: `docker compose exec bookreader cat /app/*.log`
3. GitHub issues (if applicable)
