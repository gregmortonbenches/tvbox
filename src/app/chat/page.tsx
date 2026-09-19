import { AppShell, PageHeading } from "@/components/AppShell";
import { LiveRefresh } from "@/components/LiveRefresh";
import { getMessages } from "@/lib/queries";
import { getCurrentUser } from "@/lib/session";
import { ChatInput } from "./ChatInput";

export default async function ChatPage() {
  const [user, msgs] = await Promise.all([getCurrentUser(), getMessages(200)]);

  return (
    <AppShell user={user}>
      <LiveRefresh />
      <PageHeading title="Chat" />

      <div className="flex flex-col gap-3 pb-4">
        {msgs.length === 0 ? (
          <p className="py-8 text-center text-sm text-ink-faint">Nothing yet. Say hello.</p>
        ) : (
          msgs.map((msg) => {
            const isMe = msg.userId === user?.id;
            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-0.5 ${isMe ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    isMe
                      ? "rounded-br-sm bg-accent text-canvas"
                      : "rounded-bl-sm bg-raised text-ink"
                  }`}
                >
                  {msg.content}
                </div>
                <span className="px-1 text-[10px] text-ink-faint">
                  {isMe ? "You" : msg.displayName} ·{" "}
                  {new Date(msg.sentAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="sticky bottom-0 border-t border-line bg-canvas pb-4 pt-3">
        <ChatInput />
      </div>
    </AppShell>
  );
}
