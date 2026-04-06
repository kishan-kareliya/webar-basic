import { useEffect, useRef, useState, useCallback } from "react";
import "@google/model-viewer";
import "./ARViewer.css";

// Target size in meters — the model's largest dimension will be scaled to this.
// 0.3m = 30cm is a realistic plate-of-food size on a table.
const TARGET_SIZE_M = 0.3;
// Minimum scale to prevent models from becoming invisible
const MIN_SCALE = 0.01;
// Maximum scale to prevent absurdly large models
const MAX_SCALE = 100;
// Max retries for failed model loads
const MAX_RETRIES = 2;

const STATUS = {
  LOADING: "loading",
  READY: "ready",
  ERROR: "error",
  AR_ACTIVE: "ar-active",
  AR_FAILED: "ar-failed",
  CAMERA_DENIED: "camera-denied",
  AR_UNSUPPORTED: "ar-unsupported",
};

export default function ARViewer({ item, onClose }) {
  const viewerRef = useRef(null);
  const [status, setStatus] = useState(STATUS.LOADING);
  const [arSupported, setArSupported] = useState(false);
  const [arTracking, setArTracking] = useState(null);
  const [placed, setPlaced] = useState(false);
  const [modelScale, setModelScale] = useState(null);
  const retryCountRef = useRef(0);

  // ─── Auto-normalize model size on load ───
  // GLB files come in wildly different scales depending on how they were exported.
  // A burger might be 0.001m or 50m. We measure the bounding box and scale it
  // so the largest dimension = target size.
  //
  // If item.arScale is set, use that as the target size in meters.
  // Otherwise default to TARGET_SIZE_M (30cm).
  const handleLoad = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) { setStatus(STATUS.READY); return; }

    try {
      const size = viewer.getDimensions();

      if (size && (size.x > 0 || size.y > 0 || size.z > 0)) {
        const maxDim = Math.max(size.x, size.y, size.z);
        const targetSize = item.arScale || TARGET_SIZE_M;
        let scale = targetSize / maxDim;

        // Clamp to sane range
        scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
        setModelScale(scale);

        // Apply uniform scale
        viewer.scale = `${scale} ${scale} ${scale}`;

        // Re-frame camera to fit the newly scaled model
        requestAnimationFrame(() => {
          viewer.updateFraming();
        });
      }
    } catch {
      // getDimensions not available — leave default scale
    }

    setStatus(STATUS.READY);
  }, [item.arScale]);

  // ─── Retry on error for large models that timeout ───
  const handleError = useCallback(() => {
    const viewer = viewerRef.current;
    if (retryCountRef.current < MAX_RETRIES && viewer) {
      retryCountRef.current += 1;
      // Force reload by re-assigning the src with a cache-busting query
      const base = item.glbUrl.split("?")[0];
      viewer.src = `${base}?retry=${retryCountRef.current}`;
    } else {
      setStatus(STATUS.ERROR);
    }
  }, [item.glbUrl]);

  // ─── Manual retry after all auto-retries exhausted ───
  const retryLoad = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    retryCountRef.current = 0;
    setStatus(STATUS.LOADING);
    const base = item.glbUrl.split("?")[0];
    viewer.src = `${base}?manual=${Date.now()}`;
  }, [item.glbUrl]);

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
      setStatus(STATUS.AR_FAILED);
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

    retryCountRef.current = 0;

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

    // Don't attempt AR if model failed to load
    if (status === STATUS.ERROR) return;

    // Ensure the model is fully loaded before launching AR — partial loads
    // cause Scene Viewer / Quick Look to show geometry without textures.
    if (!viewer.loaded) {
      try {
        await Promise.race([
          new Promise((resolve) => {
            viewer.addEventListener("load", resolve, { once: true });
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), 10_000)
          ),
        ]);
      } catch {
        // Load timed out — don't hang, let user retry
        return;
      }
    }

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
                Check your connection and try again.
              </p>
              <button className="ar-retry-btn" onClick={retryLoad}>
                Try Again
              </button>
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

          {status === STATUS.AR_FAILED && (
            <div className="ar-status-overlay">
              <p className="ar-status-title">AR could not start</p>
              <p className="ar-status-hint">
                Your device may not support AR, or camera access was blocked. Try again or view the 3D model below.
              </p>
              <button className="ar-retry-btn" onClick={() => setStatus(STATUS.READY)}>
                Back to 3D view
              </button>
            </div>
          )}

          <model-viewer
            ref={viewerRef}
            src={item.glbUrl}
            {...(item.imageUrl ? { poster: item.imageUrl } : {})}
            ar
            ar-modes="webxr scene-viewer quick-look"
            ar-scale="fixed"
            ar-placement="floor"
            xr-environment
            camera-controls
            touch-action="pan-y"
            auto-rotate
            auto-rotate-delay="1000"
            rotation-per-second="20deg"
            shadow-intensity="1"
            shadow-softness="0.8"
            environment-image="neutral"
            exposure="1"
            loading="eager"
            reveal="auto"
            interpolation-decay="100"
            camera-orbit="30deg 65deg auto"
            min-camera-orbit="auto auto auto"
            max-camera-orbit="auto auto auto"
            interaction-prompt="auto"
            interaction-prompt-threshold="3000"
            style={{
              width: "100%",
              height: "100%",
              visibility: status === STATUS.ERROR || status === STATUS.CAMERA_DENIED || status === STATUS.AR_FAILED ? "hidden" : "visible",
            }}
          >
            <button slot="ar-button" className="ar-slot-btn">
              Tap to place on table
            </button>

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
