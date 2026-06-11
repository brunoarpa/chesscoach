"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Mic, MicOff, Phone } from "lucide-react";

export interface CallActions {
  start: () => void;
  end: () => void;
  toggleAudio: () => void;
}

interface Props {
  lessonId: string;
  isCoach: boolean;
  /** Whether the other participant is currently in the call (from presence signaling). */
  otherInCall?: boolean;
  onCallStatusChange?: (inCall: boolean) => void;
  onAudioChange?: (enabled: boolean) => void;
  callActionsRef?: React.MutableRefObject<CallActions | null>;
}

// TURN credentials come from the server (short-lived, per-user) rather than
// the bundle. STUN-only fallback keeps calls working on most networks if the
// fetch fails.
async function getIceServers(): Promise<RTCIceServer[]> {
  const fallback: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  try {
    const res = await fetch("/api/turn");
    if (!res.ok) return fallback;
    const data = await res.json();
    return Array.isArray(data?.iceServers) && data.iceServers.length > 0
      ? data.iceServers
      : fallback;
  } catch {
    return fallback;
  }
}

export function AudioCall({ lessonId, isCoach, otherInCall, onCallStatusChange, onAudioChange, callActionsRef }: Props) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const peerRef = useRef<import("peerjs").default | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callRef = useRef<import("peerjs").MediaConnection | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const mountedRef = useRef(true);

  const otherRole = isCoach ? "student" : "coach";

  const cleanup = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    callRef.current?.close();
    callRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
    if (mountedRef.current) {
      setConnected(false);
      setConnecting(false);
    }
  }, []);

  const startCall = useCallback(async () => {
    if (peerRef.current || connecting) return;

    setConnecting(true);
    setError(null);
    retryCountRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;

      const { default: Peer } = await import("peerjs");

      const peerId = `lesson-${lessonId}-${isCoach ? "coach" : "student"}`;
      const otherPeerId = `lesson-${lessonId}-${otherRole}`;

      const iceServers = await getIceServers();
      if (!mountedRef.current) return;

      const peer = new Peer(peerId, {
        debug: 0,
        config: {
          iceServers,
        },
      });
      peerRef.current = peer;

      function wireRemoteStream(remoteStream: MediaStream) {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
        }
      }

      function attemptCall() {
        if (!peerRef.current || !localStreamRef.current || !mountedRef.current) return;

        const call = peer.call(otherPeerId, localStreamRef.current);
        if (call) {
          callRef.current = call;
          call.on("stream", (remoteStream) => {
            wireRemoteStream(remoteStream);
            if (mountedRef.current) {
              setConnected(true);
              setConnecting(false);
            }
            retryCountRef.current = 0;
          });
          call.on("close", () => {
            if (mountedRef.current) {
              setConnected(false);
            }
          });
        }
      }

      peer.on("open", () => {
        attemptCall();
      });

      peer.on("call", (incomingCall) => {
        if (!localStreamRef.current) return;
        incomingCall.answer(localStreamRef.current);
        callRef.current = incomingCall;
        incomingCall.on("stream", (remoteStream) => {
          wireRemoteStream(remoteStream);
          if (mountedRef.current) {
            setConnected(true);
            setConnecting(false);
          }
          retryCountRef.current = 0;
        });
        incomingCall.on("close", () => {
          if (mountedRef.current) {
            setConnected(false);
          }
        });
      });

      peer.on("error", (err) => {
        if (err.type === "peer-unavailable") {
          if (retryCountRef.current < 20 && mountedRef.current) {
            retryCountRef.current++;
            const delay = Math.min(3000, 1000 * retryCountRef.current);
            retryTimerRef.current = setTimeout(attemptCall, delay);
          }
        } else if (err.type === "unavailable-id") {
          peer.destroy();
          peerRef.current = null;
          if (retryCountRef.current < 3 && mountedRef.current) {
            retryCountRef.current++;
            retryTimerRef.current = setTimeout(() => startCall(), 1000);
          } else if (mountedRef.current) {
            setError("Connection error. Please refresh the page.");
            setConnecting(false);
          }
        } else if (mountedRef.current) {
          setError(`Connection error: ${err.type}`);
          setConnecting(false);
        }
      });

      peer.on("disconnected", () => {
        if (mountedRef.current && peerRef.current && !peerRef.current.destroyed) {
          peerRef.current.reconnect();
        }
      });
    } catch {
      if (mountedRef.current) {
        setError("Could not access microphone. Please check permissions.");
        setConnecting(false);
      }
    }
  }, [lessonId, isCoach, otherRole, connecting]);

  const endCall = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // Notify parent when connected state changes
  useEffect(() => {
    onCallStatusChange?.(connected || connecting);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, connecting]);

  // Track mounted state and always cleanup resources on unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
        onAudioChange?.(audioTrack.enabled);
      }
    }
  }, [onAudioChange]);

  // Expose actions to parent via ref.
  useEffect(() => {
    if (callActionsRef) {
      callActionsRef.current = { start: startCall, end: endCall, toggleAudio };
    }
  }, [callActionsRef, startCall, endCall, toggleAudio]);

  return (
    <div className="p-3 space-y-2">
      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

      <div className="flex items-center justify-center gap-3">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-full border ${connected ? "border-green-500/50 bg-green-500/10" : connecting ? "border-amber-500/50 bg-amber-500/10" : "border-muted-foreground/30"}`}>
          <Phone className={`h-4 w-4 ${connected ? "text-green-600 dark:text-green-400" : connecting ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`} />
          <span className="text-sm font-medium">
            {connected
              ? "Joined"
              : connecting
                ? otherInCall
                  ? "Connecting…"
                  : `Waiting for ${otherRole} to join…`
                : "Not in call"}
          </span>
        </div>
        {connected && (
          <button
            type="button"
            onClick={toggleAudio}
            className={`flex items-center gap-2 px-3 py-2 rounded-full border text-sm font-medium ${audioEnabled ? "border-muted-foreground/30 hover:bg-muted" : "border-destructive/40 bg-destructive/10 text-destructive"}`}
          >
            {audioEnabled ? (
              <>
                <Mic className="h-4 w-4" />
                Mic on
              </>
            ) : (
              <>
                <MicOff className="h-4 w-4" />
                Muted
              </>
            )}
          </button>
        )}
      </div>

      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}
    </div>
  );
}
