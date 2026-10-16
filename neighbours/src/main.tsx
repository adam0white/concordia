import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import "./ui/mobile-focus.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
