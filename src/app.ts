import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { SimStage } from "./components/sim-stage.js";

createRoot(document.getElementById("root")!).render(createElement(SimStage));
