"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Video, VideoOff, Mic, MicOff, Phone, PhoneOff } from "lucide-react";

interface Props {
  lessonId: string;
  userId: string;
  isCoach: boolean;
}

export function VideoCall({ lessonId, userId, isCoach }: Props) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<import("peerjs").default | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const callRef = useRef<import("peerjs").MediaConnection | null>(null);

  const myPeerId = `lesson-${lessonId}-${isCoach ? "coach" : "student"}`;
  const otherPeerId = `lesson-${lessonId}-${isCoach ? "student" : "coach"}`;

  const cleanup = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    callRef.current?.close();
    callRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
    setConnected(false);
    setConnecting(false);
  }, []);

  const startCall = useCallback(async () => {
    if (peerRef.current) return;

    setConnecting(true);
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Dynamic import to avoid SSR issues
      const { default: Peer } = await import("peerjs");

      const peer = new Peer(myPeerId, {
        debug: 0,
      });
      peerRef.current = peer;

      peer.on("open", () => {
        // Try calling the other peer
        const call = peer.call(otherPeerId, stream);
        if (call) {
          callRef.current = call;
          call.on("stream", (remoteStream) => {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
            setConnected(true);
            setConnecting(false);
          });
          call.on("close", () => {
            setConnected(false);
          });
        }
      });

      // Answer incoming calls
      peer.on("call", (incomingCall) => {
        incomingCall.answer(stream);
        callRef.current = incomingCall;
        incomingCall.on("stream", (remoteStream) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
          }
          setConnected(true);
          setConnecting(false);
        });
        incomingCall.on("close", () => {
          setConnected(false);
        });
      });

      peer.on("error", (err) => {
        if (err.type === "peer-unavailable") {
          // Other peer not connected yet — keep waiting
          setConnecting(true);
        } else {
          setError(`Connection error: ${err.type}`);
          setConnecting(false);
        }
      });
    } catch (err) {
      setError("Could not access camera/microphone. Please check permissions.");
      setConnecting(false);
    }
  }, [myPeerId, otherPeerId]);

  const endCall = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return cleanup;
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
      }
    }
  }, []);

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
              {connecting ? "Connecting..." : "Start the call to connect"}
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
        {!peerRef.current ? (
          <Button size="sm" onClick={startCall} disabled={connecting}>
            <Phone className="h-4 w-4 mr-1" />
            {connecting ? "Connecting..." : "Start Call"}
          </Button>
        ) : (
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
    </div>
  );
}
