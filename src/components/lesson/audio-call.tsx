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
  // iOS Safari blocks autoplay of an async-assigned remote stream; when that
  // happens we surface a tap-to-listen button so playback starts in a gesture.
  const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);

  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const peerRef = useRef<import("peerjs").default | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callRef = useRef<import("peerjs").MediaConnection | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  // Separate counter for "id taken" retries (a stale peer left registered after
  // the phone slept), kept apart from peer-unavailable retries so one doesn't
  // exhaust the other.
  const idRetryRef = useRef(0);
  const mountedRef = useRef(true);
  // Whether the user intends to be in the call. Drives auto-recovery: a phone
  // that backgrounds the tab kills the peer, and on return we rebuild it.
  const wantCallRef = useRef(false);
  // Ref mirrors of the connection state so the reentry guard and the
  // visibility handler read fresh values instead of stale render closures.
  const connectedRef = useRef(false);
  const connectingRef = useRef(false);
  // Holds the latest connectPeer so the reconnect timers can call it without
  // making connectPeer depend on itself.
  const connectPeerRef = useRef<() => void>(() => {});

  const otherRole = isCoach ? "student" : "coach";

  const setConnectingState = useCallback((v: boolean) => {
    connectingRef.current = v;
    if (mountedRef.current) setConnecting(v);
  }, []);

  const setConnectedState = useCallback((v: boolean) => {
    connectedRef.current = v;
    if (mountedRef.current) setConnected(v);
  }, []);

  // Drop the live peer/call but leave the microphone stream and the user's
  // intent (wantCall) and the "connecting" indicator alone. Used by the
  // unavailable-id retry so reconnecting doesn't flash the UI back to the
  // "Join Call" state on every attempt.
  const teardownPeer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    callRef.current?.close();
    callRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
  }, []);

  const cleanup = useCallback(() => {
    teardownPeer();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    connectedRef.current = false;
    connectingRef.current = false;
    if (mountedRef.current) {
      setConnected(false);
      setConnecting(false);
      setNeedsAudioUnlock(false);
    }
  }, [teardownPeer]);

  const unlockAudio = useCallback(() => {
    remoteAudioRef.current
      ?.play()
      .then(() => setNeedsAudioUnlock(false))
      .catch(() => {});
  }, []);

  // Builds (or rebuilds) the PeerJS peer and wires the call. Assumes the user
  // wants to be in the call; reuses the existing microphone stream when present
  // so retries don't re-prompt for permission. Safe to call repeatedly: it
  // no-ops if a peer is already live.
  const connectPeer = useCallback(async () => {
    if (!mountedRef.current || !wantCallRef.current || peerRef.current) return;

    try {
      if (!localStreamRef.current) {
        localStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch {
      wantCallRef.current = false;
      if (mountedRef.current) {
        setError("Could not access microphone. Please check permissions.");
        setConnectingState(false);
      }
      return;
    }
    if (!mountedRef.current || !wantCallRef.current || peerRef.current) return;

    const { default: Peer } = await import("peerjs");

    const peerId = `lesson-${lessonId}-${isCoach ? "coach" : "student"}`;
    const otherPeerId = `lesson-${lessonId}-${otherRole}`;

    const iceServers = await getIceServers();
    if (!mountedRef.current || !wantCallRef.current || peerRef.current) return;

    const peer = new Peer(peerId, {
      debug: 0,
      config: {
        iceServers,
      },
    });
    peerRef.current = peer;

    function wireRemoteStream(remoteStream: MediaStream) {
      const el = remoteAudioRef.current;
      if (!el) return;
      el.srcObject = remoteStream;
      // Explicit play(): autoPlay alone is unreliable on iOS Safari because
      // the stream is assigned outside the original tap gesture.
      el.play()
        .then(() => {
          if (mountedRef.current) setNeedsAudioUnlock(false);
        })
        .catch(() => {
          if (mountedRef.current) setNeedsAudioUnlock(true);
        });
    }

    function onConnected() {
      setConnectedState(true);
      setConnectingState(false);
      retryCountRef.current = 0;
      idRetryRef.current = 0;
    }

    // A single deterministic caller (the coach) avoids "glare": if both sides
    // place a call AND answer, two media connections form for one call, share
    // one callRef, and either one closing flips the UI to "disconnected" while
    // the other is still live. The coach calls; the student only answers.
    function attemptCall() {
      if (!peerRef.current || !localStreamRef.current || !mountedRef.current) return;

      const call = peerRef.current.call(otherPeerId, localStreamRef.current);
      if (call) {
        callRef.current = call;
        call.on("stream", (remoteStream) => {
          wireRemoteStream(remoteStream);
          onConnected();
        });
        call.on("close", onCallClose);
      }
    }

    function onCallClose() {
      setConnectedState(false);
      // The caller keeps trying to re-reach the other side after an unexpected
      // drop (e.g. the student backgrounded their phone and is rebuilding their
      // peer), as long as the user still wants to be in the call.
      if (
        isCoach &&
        wantCallRef.current &&
        mountedRef.current &&
        peerRef.current &&
        !peerRef.current.destroyed
      ) {
        setConnectingState(true);
        retryCountRef.current = 0;
        if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
        retryTimerRef.current = setTimeout(attemptCall, 1500);
      }
    }

    peer.on("open", () => {
      if (isCoach) attemptCall();
    });

    peer.on("call", (incomingCall) => {
      if (!localStreamRef.current) return;
      incomingCall.answer(localStreamRef.current);
      callRef.current = incomingCall;
      incomingCall.on("stream", (remoteStream) => {
        wireRemoteStream(remoteStream);
        onConnected();
      });
      incomingCall.on("close", onCallClose);
    });

    peer.on("error", (err) => {
      if (err.type === "peer-unavailable") {
        // Only the caller (coach) retries reaching the other side; the student
        // just waits to be called.
        if (isCoach && retryCountRef.current < 20 && mountedRef.current && wantCallRef.current) {
          retryCountRef.current++;
          // Jitter so the backoff doesn't lockstep with the other client.
          const delay = Math.min(3000, 1000 * retryCountRef.current) + Math.floor(Math.random() * 500);
          retryTimerRef.current = setTimeout(attemptCall, delay);
        }
      } else if (err.type === "unavailable-id") {
        // Our role-based id is still held on the broker, almost always by this
        // device's own peer left registered after the tab was suspended or a
        // network drop. Drop just the dead peer (keep the mic and the
        // "connecting" indicator) and retry with a jittered backoff while the
        // broker releases the stale id. Keeping the indicator on means the UI
        // stays "Connecting" instead of flickering back to "Join Call", and the
        // jitter stops two clients that dropped together from retrying in
        // lockstep and knocking each other's id offline forever.
        teardownPeer();
        if (idRetryRef.current < 8 && mountedRef.current && wantCallRef.current) {
          idRetryRef.current++;
          const delay = Math.min(8000, 1500 * idRetryRef.current) + Math.floor(Math.random() * 1500);
          setConnectingState(true);
          retryTimerRef.current = setTimeout(() => connectPeerRef.current(), delay);
        } else if (mountedRef.current) {
          setError("Couldn't reconnect the call. Tap Join to try again.");
          setConnectingState(false);
        }
      } else if (mountedRef.current) {
        setError(`Connection error: ${err.type}`);
        setConnectingState(false);
      }
    });

    peer.on("disconnected", () => {
      if (mountedRef.current && peerRef.current && !peerRef.current.destroyed) {
        peerRef.current.reconnect();
      }
    });
  }, [lessonId, isCoach, otherRole, teardownPeer, setConnectedState, setConnectingState]);

  // Keep the ref pointing at the latest connectPeer for the reconnect timers.
  useEffect(() => {
    connectPeerRef.current = connectPeer;
  }, [connectPeer]);

  const startCall = useCallback(() => {
    if (peerRef.current || connectingRef.current) return;
    wantCallRef.current = true;
    setError(null);
    retryCountRef.current = 0;
    idRetryRef.current = 0;
    setConnectingState(true);
    connectPeer();
  }, [connectPeer, setConnectingState]);

  const endCall = useCallback(() => {
    wantCallRef.current = false;
    idRetryRef.current = 0;
    cleanup();
  }, [cleanup]);

  // Mobile browsers suspend a backgrounded tab and kill the WebRTC peer. When
  // the user returns and they should still be in the call but the peer is dead
  // or disconnected, rebuild it automatically rather than stranding them.
  useEffect(() => {
    const onVisible = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      if (!wantCallRef.current || !mountedRef.current || connectingRef.current) return;
      const peer = peerRef.current;
      const healthy = peer && !peer.destroyed && !peer.disconnected && connectedRef.current;
      if (healthy) return;
      cleanup();
      idRetryRef.current = 0;
      retryCountRef.current = 0;
      startCall();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [cleanup, startCall]);

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
      wantCallRef.current = false;
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

      {needsAudioUnlock && (
        <button
          type="button"
          onClick={unlockAudio}
          className="mx-auto flex items-center gap-2 px-3 py-2 rounded-full border border-amber-500/50 bg-amber-500/10 text-sm font-medium text-amber-700 dark:text-amber-400"
        >
          <Phone className="h-4 w-4" />
          Tap to hear {otherRole}
        </button>
      )}

      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}
    </div>
  );
}
