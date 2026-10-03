"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractQrId } from "@/lib/destination";

type ScannerState = "idle" | "starting" | "scanning" | "denied" | "unsupported" | "error";

/**
 * Camera scanning built on the native BarcodeDetector. Browsers without it get
 * the manual entry field instead, so scanning is never the only way to activate.
 */
export function QrScanner({ onDetected, disabled }: { onDetected: (qrId: string) => void; disabled?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const [state, setState] = useState<ScannerState>("idle");
  const [message, setMessage] = useState("");

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const scanFrame = useCallback(
    async (detector: BarcodeDetector) => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;

      try {
        const codes = await detector.detect(video);
        const qrId = codes.map((code) => extractQrId(code.rawValue)).find((value) => value !== null);
        if (qrId) {
          stop();
          setState("idle");
          onDetected(qrId);
        }
      } catch {
        // A single unreadable frame is normal; the next tick tries again.
      }
    },
    [onDetected, stop],
  );

  async function start() {
    setMessage("");

    if (typeof BarcodeDetector === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }

    setState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      const detector = new BarcodeDetector({ formats: ["qr_code"] });
      setState("scanning");
      timerRef.current = window.setInterval(() => void scanFrame(detector), 250);
    } catch (error) {
      stop();
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
      setState(denied ? "denied" : "error");
      setMessage(denied ? "Camera access was blocked. Enter the QR ID below instead." : "Camera could not start. Enter the QR ID below instead.");
    }
  }

  function cancel() {
    stop();
    setState("idle");
  }

  return (
    <div className="rounded-md border border-line bg-canvas p-4">
      {state === "scanning" || state === "starting" ? (
        <div className="space-y-3">
          <video ref={videoRef} playsInline muted className="aspect-square w-full rounded-md bg-black object-cover" />
          <p className="text-center text-sm text-muted">Point the camera at the QR code on your card.</p>
          <button type="button" onClick={cancel} className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium">
            Stop camera
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={start}
            disabled={disabled}
            className="w-full rounded-md bg-brand px-3 py-2.5 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"
          >
            {state === "unsupported" ? "Camera scanning unavailable" : "Open camera and scan"}
          </button>
          {message ? <p className="text-center text-xs text-amber-700">{message}</p> : null}
          {state === "unsupported" ? (
            <p className="text-center text-xs text-muted">This browser has no QR camera support. Type the ID printed under the QR code.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
