import { VoiceChat } from "@/features/voice-chat/VoiceChat";
import Image from "next/image";

export default function Home() {
  return (
    <div>
      <h4 className="text-4xl  text-center">Welcome to the voice AI </h4>

      <VoiceChat />
    </div>
  );
}
