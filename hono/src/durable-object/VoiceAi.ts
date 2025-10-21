import PQueue from "p-queue";
import { smoothStream, streamText, type CoreMessage } from "ai";
import { createWorkersAI } from "workers-ai-provider";

export class VoiceAIDurableObject {
  state: DurableObjectState;
  env: CloudflareBindings;
  msgHistory: CoreMessage[] = [];

  //   Ai Model
  private readonly TEXT_TO_SPEECH_MODEL = "@cf/myshell-ai/melotts";
  private readonly TRANSCRIBE_AUDIO_MODEL = "@cf/openai/whisper-tiny-en";
  private readonly COMPLETION_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";

  constructor(state: DurableObjectState, env: CloudflareBindings) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request) {
    // Handle the websocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();

      const [client, server] = Object.values(pair);
      // Accept the websocket connection
      this.handleSession(server);

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }
  }

  async handleSession(ws: WebSocket) {
    // SteP 1: accept the websocket connection
    ws.accept();

    // Step 2: Send ready status
    ws.send(JSON.stringify({ type: "status", text: "ready" }));

    // Step 3: Handle Incoming user message
    ws.addEventListener("message", async (event) => {
      try {
        if (event.data instanceof ArrayBuffer) {
          await this.handleAudioInput(ws, event.data);
        } else {
          // handle json command
          const msg = JSON.parse(event.data) as { type: string; data: unknown };
          if (msg.type === "cmd" && msg.data === "clear") {
            this.msgHistory = [];
            ws.send(JSON.stringify({ type: "status", text: "Chat cleared" }));
          }
        }
      } catch (error) {
        console.error(`Error handling message: ${error}`);
        ws.send(
          JSON.stringify({
            type: "error",
            text: error instanceof Error ? error.message : "Unknown error",
          })
        );
      }
    });

    // Step 4: Handle WebSocket close event
    ws.addEventListener("close", () => {
      console.log("WebSocket connection closed");
    });
    ws.addEventListener("error", (error) => {
      console.error(`WebSocket error: ${error}`);
    });
  }

  async handleAudioInput(ws: WebSocket, userAudioData: ArrayBuffer) {
    ws.send(JSON.stringify({ type: "status", text: "Processing...." }));

    // Step 1: speech to text using whisper
    const transcription = await this.transcribeAudio(userAudioData);

    if (!transcription) {
      ws.send(JSON.stringify({ type: "status", text: "Idle" }));

      return;
    }

    // step 2:  Send transcription to the client
    ws.send(JSON.stringify({ type: "text", text: transcription }));
    // step 3: ADd the user message to history
    this.msgHistory.push({
      role: "user",
      content: transcription,
    });

    // step 4: generate llm response with streaming
    await this.generateAndSpeakResponse(ws, transcription);

    ws.send(JSON.stringify({ type: "status", text: "Idle" }));
  }
  async generateAndSpeakResponse(ws: WebSocket, userMessage: string) {
    // Create Workers AI provider
    const workersai = createWorkersAI({ binding: this.env.AI });

    const ttsQueue = new PQueue({ concurrency: 1 }); // it is just for the maintaining order

    try {
      const result = streamText({
        model: workersai.chat(this.COMPLETION_AI_MODEL),
        messages: this.msgHistory,
        system:
          "You are a helpful assistant in a voice conversation with the user. Keep responses concise and natural.",
        temperature: 0.7,

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

        // Process each chunk
      });

      let fullResponse = "";
      //   Process each chunk
      for await (const chunk of result.textStream) {
        const sentence = String(chunk).trim();
        if (!sentence) continue;

        // add a extra space if the fullResponse is not empty
        fullResponse += (fullResponse ? " " : "") + sentence;
        ws.send(JSON.stringify({ type: "status", text: "Speaking..." }));

        void ttsQueue.add(async () => {
          const audio = await this.textToSpeech(sentence);
          console.log(
            "TTS result for sentence:",
            sentence,
            "audio length:",
            audio?.length || 0
          );
          if (audio) {
            const message = { type: "audio", text: sentence, audio };
            console.log("Sending audio message, audio length:", audio.length);
            ws.send(JSON.stringify(message));
          } else {
            console.error("TTS returned null for sentence:", sentence);
          }
        });
      }

      //   Wait for all tts to complete
      await ttsQueue.onIdle();

      console.log("FullResponse", fullResponse);

      //   Add assistant response to history
      this.msgHistory.push({
        role: "assistant",
        content: fullResponse,
      });
    } catch (error) {
      console.error(`llm streaming error:`, error);
      throw error;
    }
  }

  async transcribeAudio(audioData: ArrayBuffer) {
    try {
      // Convert ArrayBuffer to Uint8Array for Whisper
      const audioArray = new Uint8Array(audioData);

      const result = await this.env.AI.run(this.TRANSCRIBE_AUDIO_MODEL, {
        audio: [...audioArray],
      });

      return result.text || null;
    } catch (error) {
      console.error(`Error in transcribeAudio: ${error}`);
      return null;
    }
  }

  async textToSpeech(text: string) {
    try {
      console.log("TTS input text:", text);
      const tts = await this.env.AI.run(this.TEXT_TO_SPEECH_MODEL, {
        prompt: text,
      });

      console.log(
        "TTS raw response type:",
        typeof tts,
        "keys:",
        Object.keys(tts || {})
      );

      if (typeof tts === "string") {
        console.log("TTS returned string, length:");
        return tts;
      }

      if (typeof tts === "object" && tts !== null && "audio" in tts) {
        const audioData = (tts as { audio: string }).audio;
        console.log(
          "TTS returned object with audio field, length:",
          audioData?.length || 0
        );
        return audioData;
      }

      // Convert ArrayBuffer to base64
      const uint8Array = new Uint8Array(tts as ArrayBuffer);
      const base64 = btoa(String.fromCharCode(...uint8Array));
      console.log(
        "TTS converted ArrayBuffer to base64, length:",
        base64.length
      );
      return base64;
    } catch (error) {
      console.error(`Error in textToSpeech:`, error, "for text:", text);
      return null;
    }
  }
}
