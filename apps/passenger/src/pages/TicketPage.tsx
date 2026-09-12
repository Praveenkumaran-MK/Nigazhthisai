import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { BoardingPassCard, Badge, LoadingState, Alert, TicketCountdown, Dialog, Button, Input, ShieldAlertIcon } from "@sbt/ui";
import type { Stop, Bus } from "@sbt/shared-types";
import { transferMissedTicket } from "@sbt/supabase-client";
import { RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useLoadTicket } from "../hooks/useTicket";
import { useGeofenceAlighting } from "../hooks/useGeofenceAlighting";
import { useCountdown } from "../hooks/useCountdown";
import { useI18n } from "../lib/i18n";

const statusTone = {
  CREATED: "neutral",
  PAID: "brand",
  VALIDATED: "success",
  EXPIRED: "neutral",
  CANCELLED: "danger",
} as const;

const STAR_LABELS = ["", "Terrible", "Poor", "Average", "Good", "Excellent"] as const;

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            aria-label={`Rate ${star}`}
            className={`text-3xl transition-transform duration-100 ${
              star <= (hovered || value) ? "scale-110 text-amber-500" : "scale-100 opacity-30 text-slate-400"
            }`}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => onChange(star)}
          >
            ★
          </button>
        ))}
      </div>
      {(hovered || value) > 0 && (
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {hovered || value} / 5 Stars — {STAR_LABELS[hovered || value]}
        </p>
      )}
    </div>
  );
}

interface ChatMessage {
  id: string;
  sender_role: "passenger" | "admin" | "conductor" | "system";
  message: string;
  created_at: string;
}

export function TicketPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  const { ticket, status, reload } = useLoadTicket(ticketId);
  const { t } = useI18n();

  const [originStop, setOriginStop] = useState<Stop | null>(null);
  const [destStop, setDestStop] = useState<Stop | null>(null);
  const [bus, setBus] = useState<Bus | null>(null);

  // Rating state
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingStep, setRatingStep] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [ratingErrorMsg, setRatingErrorMsg] = useState<string | null>(null);

  // Emergency Chat state
  const [showEmergencyChat, setShowEmergencyChat] = useState(false);
  const [emergencyType, setEmergencyType] = useState<"GENERAL" | "MEDICAL" | "SAFETY" | "HARASSMENT">("GENERAL");
  const [chatId, setChatId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Ticket Transfer state
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferMessage, setTransferMessage] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  useEffect(() => {
    void reload();
    const channel = supabase
      .channel(`ticket:${ticketId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets", filter: `id=eq.${ticketId}` },
        () => void reload(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  useEffect(() => {
    if (!ticket) return;
    supabase
      .from("stops_public")
      .select("*")
      .in("id", [ticket.origin_stop_id, ticket.dest_stop_id])
      .then(({ data }) => {
        const rows = (data ?? []) as Stop[];
        setOriginStop(rows.find((s) => s.id === ticket.origin_stop_id) ?? null);
        setDestStop(rows.find((s) => s.id === ticket.dest_stop_id) ?? null);
      });
    supabase.from("buses").select("*").eq("id", ticket.bus_id).single().then(({ data }) => setBus(data as Bus | null));
  }, [ticket]);

  // Realtime subscription for emergency chat
  useEffect(() => {
    if (!chatId) return;
    const msgChannel = supabase
      .channel(`emg-chat:${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "passenger_emergency_messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setChatMessages((prev) => [...prev, payload.new as ChatMessage]);
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
    };
  }, [chatId]);

  const ticketActive = ticket?.status === "PAID" || ticket?.status === "VALIDATED";
  const canRate = ticket?.status === "EXPIRED" || ticket?.status === "VALIDATED";

  const { withinGeofence, hasNotified } = useGeofenceAlighting({
    destination: destStop?.location ?? null,
    active: Boolean(ticketActive),
  });
  const countdown = useCountdown(ticketActive ? (ticket?.expires_at ?? null) : null);

  const handleSubmitRating = async () => {
    if (!ticket || ratingValue === 0) return;
    setRatingStep("submitting");
    setRatingErrorMsg(null);
    try {
      const { error } = await supabase.rpc("rate_trip", {
        p_ticket_id: ticket.id,
        p_rating: ratingValue,
        p_comment: ratingComment.trim() || null,
      });
      if (error) throw error;
      setRatingStep("done");
    } catch (e) {
      setRatingErrorMsg(e instanceof Error ? e.message : t("ratingFailed"));
      setRatingStep("error");
    }
  };

  const handleStartChat = async (type = emergencyType) => {
    if (!ticket) return;
    setIsSending(true);
    let lat: number | null = null;
    let lon: number | null = null;

    if (navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 3000 });
        });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch {
        // Location optional
      }
    }

    try {
      const { data, error } = await supabase.rpc("start_emergency_chat", {
        p_ticket_id: ticket.id,
        p_emergency_type: type,
        p_message: `Emergency reported (${type}) on Bus #${bus?.bus_number ?? "Transit Bus"}`,
        p_latitude: lat,
        p_longitude: lon,
      });

      if (error) throw error;
      setChatId(data.chat_id);
      setChatMessages([
        {
          id: "init",
          sender_role: "passenger",
          message: `Emergency reported (${type}). Awaiting control room response...`,
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      alert("Failed to initiate emergency chat: " + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !chatId || isSending) return;
    const msg = inputMessage.trim();
    setInputMessage("");
    setIsSending(true);

    try {
      const { error } = await supabase.rpc("send_emergency_message", {
        p_chat_id: chatId,
        p_message: msg,
      });
      if (error) throw error;
    } catch (err: any) {
      alert("Failed to send message: " + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleTransferTicket = async () => {
    if (!ticket) return;
    setIsTransferring(true);
    setTransferError(null);
    setTransferMessage(null);
    try {
      const res = await transferMissedTicket(supabase, ticket.id);
      setTransferMessage(`Ticket successfully transferred to Bus #${res.new_bus_number}! Your cryptographic QR pass has been re-authorized.`);
      await reload();
      if (res.new_bus_id) {
        const { data: bData } = await supabase.from("buses").select("*").eq("id", res.new_bus_id).single();
        if (bData) setBus(bData as Bus);
      }
    } catch (err: any) {
      setTransferError(err.message || "No upcoming buses found on this route or transfer limit reached.");
    } finally {
      setIsTransferring(false);
    }
  };

  if (status === "loading" || !ticket) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <LoadingState label={t("loadingTicket")} />
      </div>
    );
  }

  const createdAt = new Date(ticket.created_at);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-5 pb-24 pt-8">
      {ticketActive && <TicketCountdown label={countdown.label} expired={countdown.expired} className="w-full" />}

      <BoardingPassCard
        dateLabel={createdAt.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
        timeLabel={createdAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
        originCode={originStop?.code ?? "—"}
        originName={originStop?.name ?? "Origin"}
        destinationCode={destStop?.code ?? "—"}
        destinationName={destStop?.name ?? "Destination"}
        operatorLabel="Nigazhthisai"
        statusBadge={<Badge tone={statusTone[ticket.status]}>{ticket.status}</Badge>}
        qrValue={`${ticket.qr_payload}.${ticket.qr_signature}`}
        fields={[
          { label: "Bus", value: bus?.bus_number ?? "—" },
          { label: "Type", value: bus ? bus.type.replace("_", "-") : "—" },
          { label: "Passengers", value: ticket.passenger_count },
          { label: "Concession", value: (ticket as unknown as { concession_type?: string }).concession_type ?? "NORMAL" },
          { label: "Fare paid", value: `₹${ticket.total_fare.toFixed(2)}` },
          { label: "Valid until", value: new Date(ticket.expires_at).toLocaleTimeString() },
          { label: "Status", value: ticket.status },
        ]}
      />

      {/* Emergency Assistance Button */}
      {ticketActive && (
        <button
          type="button"
          onClick={() => {
            setShowEmergencyChat(true);
            if (!chatId) {
              void handleStartChat("GENERAL");
            }
          }}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-500/40 bg-rose-950/30 p-3 text-sm font-bold text-rose-400 shadow-md shadow-rose-950/20 backdrop-blur transition hover:bg-rose-900/40 active:scale-[0.99]"
        >
          <ShieldAlertIcon className="h-4 w-4 text-rose-500" />
          <span>Emergency Assistance / SOS Chat</span>
        </button>
      )}

      {/* Missed Bus Ticket Transfer Option */}
      {ticket.status === "PAID" && (
        <div className="w-full flex flex-col gap-2">
          <button
            type="button"
            disabled={isTransferring}
            onClick={handleTransferTicket}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-brand-500/40 bg-brand-500/10 p-3 text-xs font-bold text-brand-400 hover:bg-brand-500/20 active:scale-[0.99] transition-all"
          >
            <RefreshCw className={`h-4 w-4 ${isTransferring ? "animate-spin" : ""}`} />
            <span>Missed This Bus? Shift Ticket to Next Bus →</span>
          </button>
          {transferMessage && (
            <Alert tone="success" title="Ticket Transferred">
              {transferMessage}
            </Alert>
          )}
          {transferError && (
            <Alert tone="danger" title="Transfer Unavailable">
              {transferError}
            </Alert>
          )}
        </div>
      )}

      {ticketActive && withinGeofence && (
        <Alert tone="info" title={t("approachingDest")}>
          {hasNotified ? t("approachingDesc1") : t("approachingDesc2")}
        </Alert>
      )}

      {ticket.status === "VALIDATED" && (
        <Alert tone="success" title={t("ticketValidated")}>
          {t("ticketValidatedDesc")}
        </Alert>
      )}
      {ticket.status === "EXPIRED" && (
        <Alert tone="info" title={t("tripComplete")}>
          {t("tripCompleteDesc")}
        </Alert>
      )}

      {/* ── Trip Rating Widget ── */}
      {canRate && ratingStep !== "done" && (
        <div className="w-full rounded-2xl border border-border-light bg-white p-5 shadow-sm dark:border-border-dark dark:bg-surface-dark">
          <h2 className="mb-1 text-center text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("rateYourTrip")}
          </h2>
          <p className="mb-4 text-center text-xs text-slate-400">
            Help us improve the Nigazhthisai experience
          </p>

          <StarRating value={ratingValue} onChange={setRatingValue} />

          {ratingValue > 0 && (
            <div className="mt-4 flex flex-col gap-3">
              <textarea
                rows={2}
                placeholder="Optional comment…"
                value={ratingComment}
                onChange={(e) => setRatingComment(e.target.value)}
                className="w-full resize-none rounded-xl border border-border-light bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-border-dark dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-600"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRatingStep("done")}
                  className="flex-1 rounded-xl border border-border-light py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 dark:border-border-dark dark:hover:bg-slate-800"
                >
                  {t("skipRating")}
                </button>
                <button
                  type="button"
                  disabled={ratingStep === "submitting"}
                  onClick={handleSubmitRating}
                  className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {ratingStep === "submitting" ? "…" : t("submitRating")}
                </button>
              </div>
              {ratingStep === "error" && ratingErrorMsg && (
                <p className="text-center text-xs text-rose-500">{ratingErrorMsg}</p>
              )}
            </div>
          )}
        </div>
      )}

      {ratingStep === "done" && (
        <Alert tone="success" title={t("ratingSubmitted")}>
          {ratingValue > 0 && `You gave ${ratingValue} star${ratingValue === 1 ? "" : "s"}.`}
        </Alert>
      )}

      {/* Emergency Chat Modal */}
      <Dialog
        open={showEmergencyChat}
        onClose={() => setShowEmergencyChat(false)}
        title="Control Room Emergency Assistance"
      >
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 pb-2 overflow-x-auto border-b border-slate-800">
            {(["GENERAL", "SAFETY", "MEDICAL", "HARASSMENT"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setEmergencyType(cat);
                  void handleStartChat(cat);
                }}
                className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap transition ${
                  emergencyType === cat
                    ? "bg-rose-600 text-white"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Chat Messages Box */}
          <div className="h-64 overflow-y-auto space-y-2 p-3 bg-slate-950 rounded-xl border border-slate-800">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${
                  msg.sender_role === "passenger" ? "items-end" : "items-start"
                }`}
              >
                <div className="flex items-center gap-1 text-[10px] text-slate-400 mb-0.5">
                  <Badge tone={msg.sender_role === "passenger" ? "neutral" : "danger"}>
                    {msg.sender_role === "passenger" ? "You" : "Control Room"}
                  </Badge>
                  <span>{new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                    msg.sender_role === "passenger"
                      ? "bg-brand-600 text-white rounded-tr-none"
                      : "bg-rose-900/60 border border-rose-700/40 text-rose-100 rounded-tl-none"
                  }`}
                >
                  {msg.message}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="flex gap-2 pt-1">
            <Input
              placeholder="Type urgent message to operator…"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              className="flex-1 text-xs"
            />
            <Button size="md" variant="danger" type="submit" disabled={!inputMessage.trim() || isSending}>
              Send
            </Button>
          </form>

          <p className="text-[11px] text-slate-400 text-center">
            For life-threatening emergencies, also call local police 112 or ambulance 108.
          </p>
        </div>
      </Dialog>
    </div>
  );
}
