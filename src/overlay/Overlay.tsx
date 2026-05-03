import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import "./overlay.css";

type OverlayStage = "recording" | "transcribing" | "typing" | "done" | "error";

interface PipelineStatus {
  stage: string;
  message: string;
  error: boolean;
} 

function Overlay() {
  const [visible, setVisible] = useState(false);
  const [stage, setStage] = useState<OverlayStage>("recording");

  useEffect(() => {
    const unlistenState = listen<{ is_recording: boolean }>(
      "recording-state-changed",
      (event) => {
        if (event.payload.is_recording) {
          setStage("recording");
          setVisible(true);
        }
      }
    );

    const unlistenPipeline = listen<PipelineStatus>(
      "pipeline-status",
      (event) => {
        const { stage: s, error } = event.payload;

        if (error) {
          setStage("error");
          setTimeout(() => setVisible(false), 1800);
          return;
        }

        if (s === "recording" || s === "transcribing" || s === "typing") {
          setStage(s as OverlayStage);
          setVisible(true);
        } else if (s === "done") {
          setStage("done");
          setTimeout(() => setVisible(false), 1200);
        }
      }
    );

    return () => {
      unlistenState.then((fn) => fn());
      unlistenPipeline.then((fn) => fn());
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="overlay-container">
      {/* The parent div controls the colors via the stage class */}
      <div className={`stage-${stage}`}>
        <div className="loader"></div>
      </div>
    </div>
  );
}

export default Overlay;