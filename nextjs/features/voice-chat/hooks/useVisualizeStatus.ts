import { useEffect, useRef } from "react";

type VisualizeStatusType = {
  isListening: boolean;
  isSpeaking: boolean;
};

export const useVisualizeStatus = ({
  isListening,
  isSpeaking,
}: VisualizeStatusType) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const animationRef = useRef<number>(0);

  const analyserRef = useRef<AnalyserNode | null>(null);

  //   initialize audio analyzer for microphone
  useEffect(() => {
    if (!isListening) return;
    let audioContext: AudioContext;
    let analyser: AnalyserNode;
    let source: MediaStreamAudioSourceNode;

    const setupAudio = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        audioContext = new AudioContext();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.8;

        source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        analyserRef.current = analyser;
      } catch (error) {
        console.log(`Error accessing microphone`, error);
      }
    };

    setupAudio();
    return () => {
      if (source) {
        source.disconnect(analyser);
      }

      if (audioContext) {
        audioContext.close();
      }
    };
  }, [isListening]);

  // Draw the visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;

      // clear canvas
      ctx.fillStyle = "rgba(15, 23, 42, 0.3)";
      ctx.fillRect(0, 0, width, height);

      if (analyserRef.current) {
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        const barCount = 32;
        const barWidth = width / barCount;

        for (let i = 0; i < barCount; i++) {
          const barHeight = (dataArray[i * 4] / 255) * height * 0.8;
          const x = i * barWidth;
          const y = height - barHeight;

          // Gradient based on height
          const intensity = barHeight / height;
          let color: string;
          if (intensity > 0.75) {
            color = "#10b981"; // Green
          } else if (intensity > 0.5) {
            color = "#84cc16"; // Lime
          } else if (intensity > 0.25) {
            color = "#3b82f6"; // Blue
          } else {
            color = "#60a5fa"; // Light blue
          }

          ctx.fillStyle = color;
          ctx.fillRect(x + 2, y, barWidth - 4, barHeight);
        }
      } else {
        // Draw idle animation

        const time = Date.now() / 1000;
        for (let i = 0; i < 32; i++) {
          const barHeight = Math.sin(time * 2 + i * 0.2) * 20 + 30;
          const x = i * (width / 32);
          const y = height / 2 - barHeight / 2;

          ctx.fillStyle = "rgba(147, 51, 234, 0.3)";
          ctx.fillRect(x + 2, y, width / 32 - 4, barHeight);
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isSpeaking, isListening]);

  //   Handle Canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    const devicePixelRatio = window.devicePixelRatio;

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      const ctx = canvas.getContext("2d");

      if (ctx) {
        ctx.scale(devicePixelRatio, devicePixelRatio);
      }
    };

    resizeCanvas();

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return {
    canvasRef,
  };
};
