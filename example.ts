import { Hono } from "hono";
import { smoothStream, streamText, type CoreMessage } from "ai";
import { createWorkersAI } from "workers-ai-provider";
import PQueue from "p-queue";

// Hono app for routing
const app = new Hono<{ Bindings: Env }>();

// Main worker export
export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};

// Durable Object for managing voice AI sessions
export class VoiceAIDurableObject {
  state: DurableObjectState;
  env: Env;
  msgHistory: CoreMessage[] = [];

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    // Handle WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Accept the WebSocket connection
      this.handleSession(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    return new Response("Expected WebSocket upgrade", { status: 400 });
  }

  async handleSession(ws: WebSocket) {
    ws.accept();

    // Send ready status
    ws.send(JSON.stringify({ type: "status", text: "ready" }));

    // Handle incoming messages
    ws.addEventListener("message", async (event) => {
      try {
        // Handle binary audio data
        if (event.data instanceof ArrayBuffer) {
          await this.handleAudioInput(ws, event.data);
        } else {
          // Handle JSON commands
          const msg = JSON.parse(event.data as string);
          if (msg.type === "cmd" && msg.data === "clear") {
            this.msgHistory = [];
            ws.send(JSON.stringify({ type: "status", text: "Chat cleared" }));
          }
        }
      } catch (error) {
        console.error("Message handling error:", error);
        ws.send(
          JSON.stringify({
            type: "error",
            text: error instanceof Error ? error.message : "Unknown error",
          })
        );
      }
    });

    ws.addEventListener("close", () => {
      console.log("WebSocket connection closed");
    });

    ws.addEventListener("error", (error) => {
      console.error("WebSocket error:", error);
    });
  }

  async handleAudioInput(ws: WebSocket, audioData: ArrayBuffer) {
    ws.send(JSON.stringify({ type: "status", text: "Processing…" }));

    // Step 1: Speech-to-Text using Whisper
    const transcription = await this.transcribeAudio(audioData);

    if (!transcription) {
      ws.send(JSON.stringify({ type: "status", text: "Idle" }));
      return;
    }

    // Send transcription to client
    ws.send(JSON.stringify({ type: "text", text: transcription }));

    // Add user message to history
    this.msgHistory.push({
      role: "user",
      content: transcription,
    });

    ws.send(JSON.stringify({ type: "status", text: "Speaking…" }));

    // Step 2: Generate LLM response with streaming
    await this.generateAndSpeakResponse(ws, transcription);

    ws.send(JSON.stringify({ type: "status", text: "Idle" }));
  }

  async transcribeAudio(audioData: ArrayBuffer): Promise<string | null> {
    try {
      // Convert ArrayBuffer to Uint8Array for Whisper
      const audioArray = new Uint8Array(audioData);

      const result = await this.env.AI.run("@cf/openai/whisper-tiny-en", {
        audio: [...audioArray],
      });

      return result.text || null;
    } catch (error) {
      console.error("Transcription error:", error);
      return null;
    }
  }

  async generateAndSpeakResponse(ws: WebSocket, userMessage: string) {
    // Create Workers AI provider
    const workersai = createWorkersAI({ binding: this.env.AI });

    // Create a queue for TTS to maintain order
    const ttsQueue = new PQueue({ concurrency: 1 });
    let fullResponse = "";

    try {
      // Stream text from LLM
      const result = streamText({
        model: workersai.chat("@cf/meta/llama-3.1-8b-instruct-fp8"),
        messages: this.msgHistory,
        system:
          "You are a helpful assistant in a voice conversation with the user. Keep responses concise and natural.",
        maxTokens: 160,
        temperature: 0.7,
        // IMPORTANT: sentence chunking, no artificial delay
        experimental_transform: smoothStream({
          delayInMs: null,
          chunking: (buf: string) => {
            // emit a sentence if we see ., !, ? followed by space/end
            const m = buf.match(/^(.+?[.!?])(?:\s+|$)/);
            if (m) return m[0];
            // otherwise emit a clause if it's getting long
            if (buf.length > 120) return buf;
            return null;
          },
        }),
      });

      // Process each chunk
      for await (const chunk of result.textStream) {
        const sentence = String(chunk).trim();
        if (!sentence) continue;

        fullResponse += (fullResponse ? " " : "") + sentence;
        ws.send(JSON.stringify({ type: "status", text: "Speaking…" }));

        // Queue TTS for this sentence
        void ttsQueue.add(async () => {
          const audioData = await this.textToSpeech(sentence);
          if (audioData) {
            ws.send(
              JSON.stringify({
                type: "audio",
                text: sentence,
                audio: audioData,
              })
            );
          }
        });
      }

      // Wait for all TTS to complete
      await ttsQueue.onIdle();

      // Add assistant response to history
      this.msgHistory.push({
        role: "assistant",
        content: fullResponse,
      });
    } catch (error) {
      console.error("LLM streaming error:", error);
      throw error;
    }
  }

  async textToSpeech(text: string): Promise<string | null> {
    try {
      const tts = await this.env.AI.run("@cf/myshell-ai/melotts", {
        prompt: text,
      });

      // Normalize to a base64 string
      let b64: string;
      if (typeof tts === "string") {
        b64 = tts;
      } else if (tts && typeof tts === "object" && "audio" in tts) {
        b64 = (tts as { audio: string }).audio;
      } else {
        // Convert Uint8Array/ArrayBuffer to base64
        b64 = btoa(String.fromCharCode(...new Uint8Array(tts as ArrayBuffer)));
      }

      return b64;
    } catch (error) {
      console.error("TTS error:", error);
      return null;
    }
  }
}

// Route for WebSocket connections
app.get("/websocket", async (c) => {
  // Create a unique Durable Object ID for this session
  const id = c.env.VOICE_AI_DO.idFromName(crypto.randomUUID());
  const stub = c.env.VOICE_AI_DO.get(id);

  // Forward the request to the Durable Object
  return stub.fetch(c.req.raw);
});

// Health check endpoint
app.get("/", (c) => {
  return c.json({
    status: "ok",
    message: "Voice AI Worker is running",
    endpoints: {
      websocket: "/websocket",
    },
  });
});

// Environment type definition
interface Env {
  VOICE_AI_DO: DurableObjectNamespace;
  AI: any;
}
