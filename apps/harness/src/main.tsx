import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element in harness/index.html");

/**
 * No <StrictMode>. React 18 StrictMode double-invokes effects on mount, which
 * is great for catching cleanup bugs but turns the worker-creating effect in
 * usePixelArtPipeline (U3) into "create → terminate → create" on every mount.
 * The federated host already runs without StrictMode, so disabling here keeps
 * the harness behavior aligned with production. U7's lifecycle tests assert
 * cleanup correctness directly via spies instead of relying on StrictMode.
 */
createRoot(rootEl).render(<App />);
