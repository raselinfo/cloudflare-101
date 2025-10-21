# Deployment Guide for Voice AI Application

This guide explains how to deploy both the Next.js frontend and Hono backend to Cloudflare Workers.

## Architecture

- **Frontend**: Next.js app deployed to Cloudflare Pages/Workers
- **Backend**: Hono Durable Object deployed to Cloudflare Workers
- **Connection**: WebSocket connection between frontend and backend

## WebSocket URL Auto-Detection

The frontend automatically detects the correct WebSocket URL:

### Development (localhost)
```
ws://localhost:4000/websocket
```

### Production (Cloudflare Workers)
```
wss://hono-app.yupsis.workers.dev/websocket
```

## Environment Variables

### Frontend (.env.local)
```bash
# Optional: Override auto-detection
NEXT_PUBLIC_WS_HOST=localhost:4000          # Development
# NEXT_PUBLIC_WS_HOST=hono-app.yupsis.workers.dev  # Production override
```

### Backend (wrangler.toml)
Make sure your Hono backend has:
```toml
name = "hono-app"
main = "src/index.ts"

[[durable_objects.bindings]]
name = "VoiceAIDurableObject"
class_name = "VoiceAIDurableObject"
script_name = "hono-app"

[ai]
binding = "AI"
```

## Deployment Steps

### 1. Deploy Backend (Hono Worker)

```bash
cd hono
npm run deploy
```

This will:
- Build your Hono worker
- Deploy to Cloudflare Workers
- Output the worker URL (e.g., `https://hono-app.yupsis.workers.dev`)

### 2. Update Frontend WebSocket URL (if needed)

The frontend auto-detects the environment, but you can verify the URL in:
`nextjs/features/voice-chat/hooks/useVoiceChat.ts`

```typescript
// Production: use your deployed Hono worker URL
return 'wss://hono-app.yupsis.workers.dev/websocket';
```

### 3. Deploy Frontend (Next.js)

```bash
cd nextjs
npm run build
npx @opennextjs/cloudflare@latest
```

Or if you're using Cloudflare Pages:
```bash
npm run build
wrangler pages deploy
```

## Testing Deployment

### 1. Test Backend
```bash
curl https://hono-app.yupsis.workers.dev/
```

Expected response:
```json
{
  "status": "OK",
  "message": "Voice AI worker is running",
  "endpoint": {
    "websocket": "/websocket"
  }
}
```

### 2. Test Frontend
- Open your deployed Next.js app
- Open browser console
- Click "Start Conversation"
- Check console log: `Connecting to WebSocket: wss://hono-app.yupsis.workers.dev/websocket`

## Troubleshooting

### Issue: WebSocket connects to localhost in production

**Cause**: The WebSocket URL is hardcoded or environment variable is wrong.

**Solution**: The new code auto-detects the environment. No action needed.

### Issue: Mixed Content Error (ws:// on HTTPS)

**Cause**: Using `ws://` protocol on HTTPS site.

**Solution**: The auto-detection uses `wss://` for production. Verify the protocol in console.

### Issue: WebSocket connection refused

**Possible causes**:
1. Backend not deployed
2. Wrong worker URL in frontend
3. CORS or WebSocket not enabled

**Solution**:
- Check backend is deployed: `curl https://hono-app.yupsis.workers.dev/`
- Check console logs for actual WebSocket URL
- Verify Hono worker has WebSocket route at `/websocket`

## Environment-Specific Behavior

| Environment | Hostname | WebSocket URL |
|------------|----------|---------------|
| Local Dev  | localhost:3000 | ws://localhost:4000/websocket |
| Production | next-app.yupsis.workers.dev | wss://hono-app.yupsis.workers.dev/websocket |
| Custom     | Set NEXT_PUBLIC_WS_HOST | Auto-detects protocol |

## Custom Configuration

If you want to override the auto-detection:

### Option 1: Environment Variable
```bash
# .env.local or .env.production
NEXT_PUBLIC_WS_HOST=your-custom-worker.workers.dev
```

### Option 2: Direct Code Change
Edit `nextjs/features/voice-chat/hooks/useVoiceChat.ts`:
```typescript
// Production: use your deployed Hono worker URL
return 'wss://your-custom-worker.workers.dev/websocket';
```

## Monitoring

Check logs in Cloudflare dashboard:
- Workers & Pages → Your Worker → Logs

Backend logs will show:
```
TTS input text: Hello there!
Sending audio message, audio length: 12345
FullResponse: Hello there!
```

Frontend browser console will show:
```
Connecting to WebSocket: wss://hono-app.yupsis.workers.dev/websocket
Received message: audio {type: "audio", audio: "...", text: "Hello there!"}
```

## Notes

- The WebSocket URL is determined **at runtime** in the browser
- No rebuild needed when changing environments
- Auto-detection works for most deployment scenarios
- Use environment variables for custom configurations
