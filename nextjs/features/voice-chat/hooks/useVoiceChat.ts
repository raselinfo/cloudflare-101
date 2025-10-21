import { useEffect, useRef, useState } from "react";
import { b64ToBlob, encodeWavPCM16 } from "../utils";
import { useMicVAD } from "@ricky0123/vad-react";

const wsHost = process.env.NEXT_PUBLIC_WS_HOST || "localhost:4000";
// const wsHost = "hono-app.yupsis.workers.dev";
const socketUrl = `ws://${wsHost}/websocket`;

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

export const useVoiceChat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState<string>("Disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const audioQueueRef = useRef<{ audio: string; text: string }[]>([]);
  const isPlayingRef = useRef(false);
  const audioUnlockedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Cleanup effect
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const connect = async () => {
    try {
      const ws = new WebSocket(socketUrl);

      wsRef.current = ws;

      console.log(`😀 wsHost url`, wsHost, "socketUrl", socketUrl);

      ws.onopen = () => {
        setStatus("Connecting....");
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case "status": {
              setStatus(data.text);
              if (data.text === "ready") {
                setStatus("ready");
                break;
              }
              if (data.text === "Speaking...") {
                setIsSpeaking(true);
                break;
              }
              if (data.text === "Idle") {
                setIsListening(false);
                break;
              }
              break;
            }

            case "text": {
              setMessages((prev) => [
                ...prev,
                { role: "user", content: data.text },
              ]);
            }

            case "audio": {
              audioQueueRef.current.push({
                audio: data.audio,
                text: data.text,
              });

              setMessages((prev) => {
                const lastMsg = prev[prev.length - 1];

                if (lastMsg && lastMsg.role === "assistant") {
                  return [
                    ...prev.slice(0, -1),
                    {
                      ...lastMsg,
                      content: lastMsg.content + " " + data.text,
                    },
                  ];
                }
                return [...prev, { role: "assistant", content: data.text }];
              });
              void playNextInQueue();

              break;
            }

            case "error": {
              console.error("Server error:", data.text);
              setStatus(`Error ${data.text}`);
              break;
            }
          }
        } catch (error) {
          console.error("Failed to parse message:", error);
        }

        // Handle other events
        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
          setStatus("Connection error");
        };

        ws.onclose = () => {
          console.log("WebSocket closed");
          setIsConnected(false);
          setStatus("Disconnected");

          wsRef.current = null;
        };
      };

      await waitForOpenConnection(ws);
    } catch (error) {
      console.error("Connection failed:", error);
      setStatus("Connection failed");
    }
  };

  const waitForOpenConnection = (ws: WebSocket) => {
    return new Promise((resolve, reject) => {
      if (ws?.readyState === WebSocket.OPEN) {
        resolve(ws);
        return;
      }

      ws?.addEventListener("open", () => {
        resolve(ws);
      });

      ws?.addEventListener("error", (error) => {
        reject(error);
      });
    });
  };

  const playNextInQueue = async () => {
    if (isPlayingRef?.current || audioQueueRef.current?.length === 0) return;

    isPlayingRef.current = true;
    setIsSpeaking(true);

    const { audio } = audioQueueRef.current.shift()!;

    try {
      if (!audio) {
        throw new Error("No audio data received");
      }

      console.log("Playing audio chunk, base64 length:", audio.length);

      const blob = b64ToBlob(audio);
      console.log("Blob created:", blob.size, "bytes, type:", blob.type);

      const url = URL.createObjectURL(blob);
      const audioElement = new Audio(url);

      const revokeUrl = () => {
        URL.revokeObjectURL(url);
        isPlayingRef.current = false;
        setIsSpeaking(false);
        void playNextInQueue();
      };

      audioElement.onended = () => {
        console.log("Audio playback ended");
        revokeUrl();
      };

      audioElement.onerror = (error) => {
        console.error("Audio element error:", error);
        revokeUrl();
      };

      await audioElement.play();
      console.log("Audio playback started successfully");
    } catch (error) {
      console.error(`Audio playback error: `, error);
      isPlayingRef.current = false;
      setIsSpeaking(false);
      void playNextInQueue();
    }
  };

  const unlockAudio = () => {
    if (audioUnlockedRef.current) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }

    audioUnlockedRef.current = true;
  };

  // Handle voice activity detection
  const vad = useMicVAD({
    startOnLoad: false,
    onSpeechEnd: async (audio) => {
      console.log("Speech ended, processing...");
      // Encode audio to WAV format
      const wavBuffer = encodeWavPCM16(audio, 16000);

      // Send to the server
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(wavBuffer);
        setStatus("Processing....");
      }
    },

    onVADMisfire: () => {
      console.log("VAD misfire");
    },
    onSpeechStart: () => {
      console.log("VAD speech start");
      setStatus("Listening...");
    },
  });

  // Start Conversation
  const handleStart = async () => {
    console.log(`Initiate Chat Start `);
    unlockAudio();
    console.log(`Step 1: Audio is unlocked`);
    await connect();
    console.log(`Step 2: Socket is connected`);

    // Wait a bit for connection to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));

    vad.start();
    console.log(`Step 3: Vad is started`);

    setIsListening(true);
    setStatus("Listening...");
  };

  // Stop Conversation
  const handleStop = () => {
    vad.pause();
    setIsListening(false);
    wsRef.current?.close();
  };

  // Chat Clear
  const handleChatClear = () => {
    setMessages([]);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "cmd", data: "clear" }));
    }
  };

  return {
    handleStart,
    handleStop,
    handleChatClear,
    isListening,
    isConnected,
    isSpeaking,
    status,
    messages,
  };
};
