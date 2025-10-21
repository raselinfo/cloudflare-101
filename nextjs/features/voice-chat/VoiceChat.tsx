"use client";

import React from "react";
import { useVoiceChat } from "./hooks/useVoiceChat";
import { AudioAnalyzer } from "./AudioAnalyzer";

export const VoiceChat = () => {
  const {
    handleStart,
    handleStop,
    handleChatClear,
    isListening,
    isConnected,
    isSpeaking,
    status,
    messages,
  } = useVoiceChat();
  return (
    <div className="grid-cols-2">
      {/* Visual Status */}
      <div>
        <AudioAnalyzer
          isConnected={isConnected}
          isSpeaking={isSpeaking}
          isListening={isListening}
          status={status}
        />
      </div>
      {/* Chat section */}
      <div>
        {/* Action Buttons */}
        <div className="flex gap-5 items-center">
          {!isListening ? (
            <button
              onClick={handleStart}
              className="px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              Start Conversation
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="px-8 py-4 bg-red-500 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
            >
              Stop Conversation
            </button>
          )}
          <button
            onClick={handleChatClear}
            className="px-6 py-4 bg-gray-700 text-white font-semibold rounded-full shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200"
          >
            Clear Chat
          </button>
        </div>

        {/* Messages */}
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 shadow-2xl min-h-[400px] max-h-[600px] overflow-y-auto mt-5">
          {messages.length === 0 ? (
            <div className="text-center text-purple-200 py-12">
              <p className="text-xl mb-2">Ready to chat!</p>
              <p className="text-sm opacity-75">
                Click &quot;Start Conversation&quot; to begin
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${
                    msg.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[80%] px-4 py-3 rounded-2xl ${
                      msg.role === "user"
                        ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                        : "bg-white/20 text-white"
                    }`}
                  >
                    <div className="text-xs opacity-75 mb-1">
                      {msg.role === "user" ? "You" : "AI Assistant"}
                    </div>
                    <div className="text-sm">{msg.content}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
