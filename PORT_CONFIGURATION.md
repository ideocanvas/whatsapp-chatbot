# 🔧 Web Port and Host Configuration

## Setting the Web Port and Host Binding

The autonomous agent web interface port and host binding are configurable through environment variables. Here are the ways to set them:

### Method 1: Environment Variable (Recommended)
```bash
# Set port via environment variable
export PORT=8080
npm run autonomous

# Or set it inline
PORT=8080 npm run autonomous
```

### Method 2: .env File
Create or edit the `.env` file in your project root:
```env
PORT=8080
WHATSAPP_ACCESS_TOKEN=your_token_here
WHATSAPP_PHONE_NUMBER_ID=your_number_id_here
```

### Method 3: Command Line with Development Mode
```bash
# Development mode on port 8080
PORT=8080 npm run autonomous:dev

# Watch mode on custom port
PORT=9000 npm run autonomous:watch
```

## Default Configuration

- **Default Port**: `3000` (if no PORT environment variable is set)
- **Default Host**: `localhost` (development) or `0.0.0.0` (production)
- **Common Port Alternatives**: `8080`, `8000`, `3001`, `5000`

## Host Binding to 0.0.0.0

To allow external network access, bind to `0.0.0.0`:

### Method 1: Environment Variable
```bash
# Bind to all network interfaces
HOST=0.0.0.0 npm run autonomous

# Or set NODE_ENV to production (automatically binds to 0.0.0.0)
NODE_ENV=production npm run autonomous
```

### Method 2: .env File
```env
HOST=0.0.0.0
PORT=8080
NODE_ENV=production
```

### Method 3: Combined Configuration
```bash
# Bind to all interfaces on port 8080
HOST=0.0.0.0 PORT=8080 npm run autonomous
```

## Port and Host Configuration Examples

### Production Deployment (External Access)
```bash
# Bind to all network interfaces for external access
HOST=0.0.0.0 PORT=80 npm run autonomous

# Cloud deployment with production mode
NODE_ENV=production npm run autonomous
```

### Development with External Access
```bash
# Allow other devices on network to access
HOST=0.0.0.0 npm run autonomous:dev

# Custom port with network access
HOST=0.0.0.0 PORT=8080 npm run autonomous:dev
```

### Development with Multiple Instances
```bash
# Instance 1 on port 3000 (localhost only)
npm run autonomous:dev

# Instance 2 on port 3001 with network access
HOST=0.0.0.0 PORT=3001 npm run autonomous:dev
```

### Docker/Container Deployment
```dockerfile
# In Dockerfile or docker-compose.yml
environment:
  - PORT=80
```

## Verification

After setting the port and host, verify it's working:

### Local Access (localhost)
1. **Check console output** - The server will display URLs:
   ```
   🌐 Web Dashboard: http://localhost:8080 (local)
   ```

2. **Access the dashboard** - Open your browser to:
   ```
   http://localhost:[YOUR_PORT]
   ```

### Network Access (0.0.0.0)
1. **Check console output** - The server will display both local and network URLs:
   ```
   🌐 Web Dashboard: http://localhost:8080 (local)
   🌐 Web Dashboard: http://[your-ip]:8080 (network)
   ```

2. **Find your IP address**:
   ```bash
   # Linux/Mac
   ip addr show | grep inet
   
   # Windows
   ipconfig
   ```

3. **Access from other devices** - Use your machine's IP address:
   ```
   http://[YOUR_IP]:[YOUR_PORT]
   ```

4. **Health check** - Verify the server is running:
   ```
   http://localhost:[YOUR_PORT]/health
   http://[YOUR_IP]:[YOUR_PORT]/health
   ```

## Common Port Issues

### Port Already in Use
If you get "EADDRINUSE" error, the port is occupied:
```bash
# Solution 1: Use a different port
PORT=3001 npm run autonomous

# Solution 2: Find and kill the process using the port (Linux/Mac)
lsof -ti:3000 | xargs kill -9

# Solution 3: Use system-assigned port (set PORT to empty)
PORT= npm run autonomous  # Will use default 3000 or system-assigned
```

### Firewall/Access Issues
- Ensure the port is not blocked by firewall
- For external access, configure your network/router
- Cloud deployments may require port forwarding

## Environment Variable Priority

The configuration follows this priority:

**Host Binding:**
1. `HOST` environment variable (explicit setting)
2. `NODE_ENV=production` (automatically uses `0.0.0.0`)
3. Default host `localhost` (development fallback)

**Port Configuration:**
1. `PORT` environment variable (highest priority)
2. Default port `3000` (fallback)

## Complete Examples

### Development with Local Access Only
```bash
# Local development (default settings)
export PORT=8080
export DEV_MODE=true
export OPENAI_API_KEY=your_openai_key

npm run autonomous:dev
# Access at: http://localhost:8080
```

### Development with Network Access
```bash
# Allow other devices to access
export HOST=0.0.0.0
export PORT=8080
export DEV_MODE=true

npm run autonomous:dev
# Access at: http://localhost:8080 (local) and http://[your-ip]:8080 (network)
```

### Production Deployment
```bash
# Production configuration with external access
export NODE_ENV=production
export PORT=80
export OPENAI_API_KEY=your_openai_key

npm run autonomous
# Binds to 0.0.0.0:80 for external access
```

### Docker/Container Deployment
```dockerfile
# In Dockerfile or docker-compose.yml
environment:
  - NODE_ENV=production
  - PORT=80
  - HOST=0.0.0.0
```

The server will automatically bind to `0.0.0.0` when `NODE_ENV=production` is set, making it accessible from external networks while maintaining security in development mode.

The web interface will automatically use the configured port and display the correct URL in the startup logs.