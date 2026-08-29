"use client";

import { useState } from "react";

import ChatPanel, {
  NEUTRAL_PROFILE,
  type Profile,
} from "@/presentation/components/chat/ChatPanel";

/**
 * Página del agente de intención.
 *
 * El panel es autónomo y reutilizable: cuando el dashboard de mastering esté
 * armado se monta al lado de las perillas y `onProfileChange` las alimenta.
 * Esta ruta existe para poder trabajarlo y probarlo por separado.
 */
export default function VozPage() {
  const [profile, setProfile] = useState<Profile>(NEUTRAL_PROFILE);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 p-4 sm:p-8">
      <div className="min-h-0 flex-1">
        <ChatPanel profile={profile} onProfileChange={setProfile} />
      </div>
    </main>
  );
}
