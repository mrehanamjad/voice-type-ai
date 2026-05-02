// import { useState, useEffect } from "react";
// import { listen } from "@tauri-apps/api/event";
// import "./overlay.css";

// type OverlayStage = "recording" | "transcribing" | "typing" | "done" | "error";

// interface PipelineStatus {
//   stage: string;
//   message: string;
//   error: boolean;
// }

// const stageColors: Record<OverlayStage, string> = {
//   recording: "#ef4444",
//   transcribing: "#f59e0b",
//   typing: "#3b82f6",
//   done: "#22c55e",
//   error: "#ef4444",
// };

// const stageIcons: Record<OverlayStage, string> = {
//   recording: "🎙️",
//   transcribing: "✨",
//   typing: "⌨️",
//   done: "✅",
//   error: "❌",
// };

// function Overlay() {
//   const [visible, setVisible] = useState(false);
//   const [stage, setStage] = useState<OverlayStage>("recording");

//   useEffect(() => {
//     const unlistenState = listen<{ is_recording: boolean }>(
//       "recording-state-changed",
//       (event) => {
//         if (event.payload.is_recording) {
//           setStage("recording");
//           setVisible(true);
//         }
//       }
//     );

//     const unlistenPipeline = listen<PipelineStatus>(
//       "pipeline-status",
//       (event) => {
//         const { stage: s, error } = event.payload;

//         if (error) {
//           setStage("error");
//           setTimeout(() => setVisible(false), 1500);
//           return;
//         }

//         if (s === "recording" || s === "transcribing" || s === "typing") {
//           setStage(s as OverlayStage);
//           setVisible(true);
//         } else if (s === "done") {
//           setStage("done");
//           setTimeout(() => setVisible(false), 800);
//         }
//       }
//     );

//     return () => {
//       unlistenState.then((fn) => fn());
//       unlistenPipeline.then((fn) => fn());
//     };
//   }, []);

//   if (!visible) return null;

//   const color = stageColors[stage];

//   const renderIndicator = () => {
//     if (stage === "recording") {
//       return (
//         <div className="waveform">
//           <div className="bar" style={{ backgroundColor: color }}></div>
//           <div className="bar" style={{ backgroundColor: color }}></div>
//           <div className="bar" style={{ backgroundColor: color }}></div>
//         </div>
//       );
//     }
//     if (stage === "transcribing" || stage === "typing") {
//       return <div className="spinner" style={{ borderTopColor: color }}></div>;
//     }
//     return <span className="overlay-dot" style={{ background: color }} />;
//   };

//   return (
//     <div className="overlay-container">
//       <div
//         className={`overlay-pill ${stage === "recording" ? "pulse-glow" : ""} ${
//           stage === "done" ? "fade-out" : "fade-in"
//         }`}
//         style={{
//           background: "rgba(30, 30, 46, 0.8)",
//           borderColor: `${color}44`,
//           boxShadow: `0 0 15px ${color}44, inset 0 0 10px ${color}22`,
//         }}
//       >
//         <span className="overlay-icon">{stageIcons[stage]}</span>
//         {renderIndicator()}
//       </div>
//     </div>
//   );
// }

// export default Overlay;



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
          setTimeout(() => setVisible(false), 1500);
          return;
        }

        if (s === "recording" || s === "transcribing" || s === "typing") {
          setStage(s as OverlayStage);
          setVisible(true);
        } else if (s === "done") {
          setStage("done");
          setTimeout(() => setVisible(false), 900);
        }
      }
    );

    return () => {
      unlistenState.then((fn) => fn());
      unlistenPipeline.then((fn) => fn());
    };
  }, []);

  if (!visible) return null;

  const renderIndicator = () => {
    if (stage === "recording") {
      return (
        <div className="waveform">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="bar" />
          ))}
        </div>
      );
    }
    if (stage === "transcribing" || stage === "typing") {
      return <div className="spinner-ring" />;
    }
    if (stage === "done") {
      return <div className="done-dot" />;
    }
    if (stage === "error") {
      return <div className="error-dot" />;
    }
    return null;
  };

  return (
    <div className="overlay-container">
      <div className={`pill ${stage}`}>
        {renderIndicator()}
      </div>
    </div>
  );
}

export default Overlay;