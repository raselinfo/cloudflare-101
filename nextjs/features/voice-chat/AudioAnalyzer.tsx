import React, { FC } from "react";
import { useVisualizeStatus } from "./hooks/useVisualizeStatus";

type AudioAnalyzerProps = {
  isListening: boolean;
  isSpeaking: boolean;
  status: string;
  isConnected: boolean;
};
export const AudioAnalyzer: FC<AudioAnalyzerProps> = ({
  isListening,
  isConnected,
  isSpeaking,
  status,
}) => {
  const { canvasRef } = useVisualizeStatus({ isListening, isSpeaking });
  return (
    <div className="mb-8">
      {/* Canvas Visualizer */}
      <div className="relative w-full h-32 bg-slate-900/50 rounded-xl overflow-hidden mb-4 shadow-xl">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      {/* Status Indicator */}
      <div className="flex items-center justify-center gap-3">
        <div
          className={`w-3 h-3 rounded-full ${getStatusColor({
            isConnected,
            isListening,
            isSpeaking,
          })} animate-pulse`}
        />
        <span className="text-white font-medium">{status}</span>
      </div>
    </div>
  );
};

// Determine status color
const getStatusColor = ({
  isConnected,
  isSpeaking,
  isListening,
}: {
  isConnected: boolean;
  isSpeaking: boolean;
  isListening: boolean;
}) => {
  if (!isConnected) return "bg-gray-500";
  if (isSpeaking) return "bg-green-500";
  if (isListening) return "bg-blue-500";
  return "bg-purple-500";
};
