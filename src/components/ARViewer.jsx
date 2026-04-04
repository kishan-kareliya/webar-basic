import { useEffect, useRef, useState, useCallback } from "react";
import "@google/model-viewer";
import "./ARViewer.css";

const STATUS = {
  LOADING: "loading",
  READY: "ready",
  ERROR: "error",
  AR_ACTIVE: "ar-active",
  CAMERA_DENIED: "camera-denied",
  AR_UNSUPPORTED: "ar-unsupported",
};

export default function ARViewer({ item, onClose }) {
  const viewerRef = useRef(null);
  const [status, setStatus] = useState(STATUS.LOADING);
  const [arSupported, setArSupported] = useState(false);
  const [arTracking, setArTracking] = useState(null); // "tracking" | "not-tracking"
  const [placed, setPlaced] = useState(false);

  // ─── Model load / error ───
  const handleLoad = useCallback(() => setStatus(STATUS.READY), []);
  const handleError = useCallback(() => setStatus(STATUS.ERROR), []);

  // ─── AR lifecycle events ───
  const handleARStatus = useCallback((e) => {
    const s = e.detail.status;
    if (s === "session-started") {
      setStatus(STATUS.AR_ACTIVE);
      setPlaced(false);
      setArTracking(null);
    } else if (s === "object-placed") {
      setPlaced(true);
    } else if (s === "not-presenting") {
      setStatus(STATUS.READY);
      setPlaced(false);
      setArTracking(null);
    } else if (s === "failed") {
      setStatus(STATUS.READY);
    }
  }, []);

  // ─── AR tracking quality (WebXR only — detects jitter source) ───
  const handleARTracking = useCallback((e) => {
    setArTracking(e.detail.status); // "tracking" or "not-tracking"
  }, []);

  // ─── Setup / teardown ───
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.addEventListener("load", handleLoad);
    viewer.addEventListener("error", handleError);
    viewer.addEventListener("ar-status", handleARStatus);
    viewer.addEventListener("ar-tracking", handleARTracking);

    // Detect AR support — model-viewer exposes this as a promise
    const checkAR = async () => {
      // Wait for the element to be ready
      await viewer.updateComplete;
      try {
        const supported = await viewer.canActivateAR;
        setArSupported(Boolean(supported));
        if (!supported) setStatus((prev) => prev === STATUS.LOADING ? STATUS.LOADING : STATUS.AR_UNSUPPORTED);
      } catch {
        setArSupported(false);
      }
    };
    checkAR();

    return () => {
      viewer.removeEventListener("load", handleLoad);
      viewer.removeEventListener("error", handleError);
      viewer.removeEventListener("ar-status", handleARStatus);
      viewer.removeEventListener("ar-tracking", handleARTracking);
    };
  }, [handleLoad, handleError, handleARStatus, handleARTracking]);

  // ─── Escape to close ───
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // ─── Lock body scroll ───
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // ─── Camera permission check + AR launch ───
  const launchAR = async () => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    // Pre-check camera permission so the user sees our prompt, not a raw browser popup
    try {
      const permissionStatus = await navigator.permissions?.query({ name: "camera" });
      if (permissionStatus?.state === "denied") {
        setStatus(STATUS.CAMERA_DENIED);
        return;
      }
    } catch {
      // permissions API not available (iOS Safari) — let model-viewer handle it
    }

    // On Android Scene Viewer / iOS Quick Look, model-viewer hands off to the OS
    // which handles its own camera permission. activateAR() triggers the right path.
    viewer.activateAR();
  };

  const isARActive = status === STATUS.AR_ACTIVE;

  return (
    <div className="ar-overlay" onClick={onClose}>
      <div className="ar-modal" onClick={(e) => e.stopPropagation()}>

        {/* ─── Header ─── */}
        <div className="ar-modal-header">
          <div className="ar-item-info">
            <h2>{item.name}</h2>
            <span className="ar-item-price">${item.price.toFixed(2)}</span>
          </div>
          <button className="ar-close-btn" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {/* ─── 3D / AR Viewer ─── */}
        <div className="ar-viewer-container">

          {status === STATUS.LOADING && (
            <div className="ar-status-overlay">
              <div className="ar-spinner" />
              <p>Loading 3D model...</p>
            </div>
          )}

          {status === STATUS.ERROR && (
            <div className="ar-status-overlay">
              <p className="ar-status-title">Failed to load 3D model</p>
              <p className="ar-status-hint">
                Place your <code>.glb</code> file at: <code>{item.glbUrl}</code>
              </p>
            </div>
          )}

          {status === STATUS.CAMERA_DENIED && (
            <div className="ar-status-overlay">
              <p className="ar-status-title">Camera access denied</p>
              <p className="ar-status-hint">
                Enable camera permission in your browser settings to use AR.
              </p>
              <button className="ar-retry-btn" onClick={() => setStatus(STATUS.READY)}>
                Back to 3D view
              </button>
            </div>
          )}

          {/*
            model-viewer config — these attributes control the entire AR pipeline:

            ar-modes priority order:
            1. scene-viewer  → Android: hands off to Google's native AR app (best stability)
            2. webxr          → In-browser AR via WebXR API (Chrome Android fallback)
            3. quick-look     → iOS: hands off to Apple's native AR Quick Look

            ar-scale="fixed"  → CRITICAL: prevents the model from being resized by
                                 the user in AR. Food should appear at real-world scale.

            ar-placement="floor" → Anchors to horizontal surfaces (tables).

            xr-environment    → Matches 3D lighting to real-world camera feed lighting
                                 so the food doesn't look "pasted on".
          */}
          <model-viewer
            ref={viewerRef}
            src={item.glbUrl}
            ar
            ar-modes="scene-viewer webxr quick-look"
            ar-scale="fixed"
            ar-placement="floor"
            xr-environment
            camera-controls
            touch-action="pan-y"
            auto-rotate
            auto-rotate-delay="1000"
            rotation-per-second="20deg"
            shadow-intensity="1.2"
            shadow-softness="1"
            environment-image="neutral"
            exposure="1"
            loading="eager"
            reveal="auto"
            camera-orbit="30deg 65deg 2m"
            min-camera-orbit="auto auto 0.5m"
            max-camera-orbit="auto auto 5m"
            field-of-view="45deg"
            interaction-prompt="auto"
            interaction-prompt-threshold="3000"
            style={{
              width: "100%",
              height: "100%",
              visibility: status === STATUS.ERROR || status === STATUS.CAMERA_DENIED ? "hidden" : "visible",
            }}
          >
            {/* Slot: custom AR button shown inside the model-viewer when in AR mode */}
            <button slot="ar-button" className="ar-slot-btn">
              Tap to place on table
            </button>

            {/* Slot: custom loading progress bar */}
            <div slot="progress-bar" className="ar-progress-bar">
              <div className="ar-progress-fill" />
            </div>
          </model-viewer>

          {/* WebXR tracking quality indicator — shown when AR is active via WebXR */}
          {isARActive && arTracking === "not-tracking" && (
            <div className="ar-tracking-hint">
              Move your phone slowly to detect the surface
            </div>
          )}

          {isARActive && arTracking === "tracking" && !placed && (
            <div className="ar-tracking-hint ar-tracking-good">
              Tap on the table to place {item.name}
            </div>
          )}
        </div>

        {/* ─── Footer ─── */}
        <div className="ar-modal-footer">
          {status === STATUS.CAMERA_DENIED ? (
            <p className="ar-hint-text">
              Camera permission is required. Check your browser or device settings.
            </p>
          ) : arSupported ? (
            <button className="ar-launch-btn" onClick={launchAR} disabled={status === STATUS.LOADING}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              View on Your Table
            </button>
          ) : (
            <div className="ar-footer-info">
              <p className="ar-hint-text">
                Rotate and zoom the 3D model with your fingers.
              </p>
              <p className="ar-hint-sub">
                Open on a mobile device for AR table placement.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
