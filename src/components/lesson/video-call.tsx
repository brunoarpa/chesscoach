"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Video, VideoOff, Mic, MicOff, Phone, PhoneOff } from "lucide-react";
import { getPusherClient } from "@/lib/pusher-client";

export interface CallActions {
  start: () => void;
  end: () => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
}

interface Props {
  lessonId: string;
  userId: string;
  isCoach: boolean;
  onCallStatusChange?: (inCall: boolean) => void;
  onAudioChange?: (enabled: boolean) => void;
  callActionsRef?: React.MutableRefObject<CallActions | null>;
}

function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ];
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;
  if (turnUrl && turnUser && turnCred) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
  }
  return servers;
}

export function VideoCall({ lessonId, userId, isCoach, onCallStatusChange, onAudioChange, callActionsRef }: Props) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [remoteInCall, setRemoteInCall] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const { default: Peer } = await import("peerjs");

      // Use deterministic peer IDs so both sides can find each other
      // Add a retry mechanism for stale IDs
      const peerId = `lesson-${lessonId}-${isCoach ? "coach" : "student"}`;
      const otherPeerId = `lesson-${lessonId}-${otherRole}`;

      const peer = new Peer(peerId, {
        debug: 0,
        config: {
          iceServers: getIceServers(),
        },
      });
      peerRef.current = peer;

      function attemptCall() {
        if (!peerRef.current || !localStreamRef.current || !mountedRef.current) return;

        const call = peer.call(otherPeerId, localStreamRef.current);
        if (call) {
          callRef.current = call;
          call.on("stream", (remoteStream) => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
            if (mountedRef.current) {
              setConnected(true);
              setConnecting(false);
            }
            retryCountRef.current = 0;
          });
          call.on("close", () => {
            if (mountedRef.current) setConnected(false);
          });
        }
      }

      peer.on("open", () => {
        attemptCall();
      });

      // Answer incoming calls
      peer.on("call", (incomingCall) => {
        if (!localStreamRef.current) return;
        incomingCall.answer(localStreamRef.current);
        callRef.current = incomingCall;
        incomingCall.on("stream", (remoteStream) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
          if (mountedRef.current) {
            setConnected(true);
            setConnecting(false);
          }
          retryCountRef.current = 0;
        });
        incomingCall.on("close", () => {
          if (mountedRef.current) setConnected(false);
        });
      });

      peer.on("error", (err) => {
        if (err.type === "peer-unavailable") {
          // Other peer not connected yet — retry with backoff
          if (retryCountRef.current < 20 && mountedRef.current) {
            retryCountRef.current++;
            const delay = Math.min(3000, 1000 * retryCountRef.current);
            retryTimerRef.current = setTimeout(attemptCall, delay);
          }
        } else if (err.type === "unavailable-id") {
          // Stale peer ID from another open tab/session
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
        // Try to reconnect
        if (mountedRef.current && peerRef.current && !peerRef.current.destroyed) {
          peerRef.current.reconnect();
        }
      });
    } catch {
      if (mountedRef.current) {
        setError("Could not access camera/microphone. Please check permissions.");
        setConnecting(false);
      }
    }
  }, [lessonId, isCoach, otherRole, cleanup]);

  const endCall = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // Notify parent when connected state changes; also broadcast via Pusher.
  useEffect(() => {
    onCallStatusChange?.(connected);
    fetch(`/api/lesson/${lessonId}/board/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: "call:status", data: { joined: connected } }),
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  // Subscribe to Pusher for remote call status.
  useEffect(() => {
    const pusher = getPusherClient();
    if (!pusher) return;
    const channel = pusher.subscribe(`private-lesson-${lessonId}`);
    const handler = (data: { joined: boolean; senderId: string }) => {
      if (data.senderId !== userId) setRemoteInCall(data.joined);
    };
    channel.bind("call:status", handler);
    return () => {
      channel.unbind("call:status", handler);
      pusher.unsubscribe(`private-lesson-${lessonId}`);
    };
  }, [lessonId, userId]);

  // Track mounted state and always cleanup resources on unmount.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
      }
    }
  }, []);

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
      callActionsRef.current = { start: startCall, end: endCall, toggleAudio, toggleVideo };
    }
  }, [callActionsRef, startCall, endCall, toggleAudio, toggleVideo]);

  return (
    <div className="p-2 space-y-2">
      {/* Video streams */}
      <div className="relative bg-black rounded overflow-hidden aspect-video">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        {!connected && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/80">
            <p className="text-sm text-muted-foreground">
              {connecting
                ? "Connecting..."
                : remoteInCall
                  ? "Other participant is in the call…"
                  : "Waiting for other participant to join"}
            </p>
          </div>
        )}
        {/* Local video pip */}
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="absolute bottom-2 right-2 w-24 h-18 rounded border-2 border-background object-cover"
        />
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Controls */}
      <div className="flex items-center justify-center gap-2">
        {!connected && !connecting && (
          <Button size="sm" onClick={startCall}>
            <Phone className="h-4 w-4 mr-1" />
            Join Call
          </Button>
        )}

        {connecting && (
          <Button size="sm" variant="outline" onClick={endCall}>
            Cancel
          </Button>
        )}

        {(connected || connecting) && (
          <>
            <Button
              size="icon"
              variant={videoEnabled ? "outline" : "destructive"}
              className="h-8 w-8"
              onClick={toggleVideo}
            >
              {videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant={audioEnabled ? "outline" : "destructive"}
              className="h-8 w-8"
              onClick={toggleAudio}
            >
              {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </Button>
            <Button size="icon" variant="destructive" className="h-8 w-8" onClick={endCall}>
              <PhoneOff className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      <p className="text-[11px] text-center text-muted-foreground">
        {connected
          ? "In call · both connected"
          : remoteInCall
            ? "Other participant is in the call — join to connect"
            : connecting
              ? "Joining call…"
              : "Other participant hasn't joined the call yet"}
      </p>
    </div>
  );
}
