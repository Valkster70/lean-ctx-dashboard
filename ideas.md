# lean-ctx Dashboard Feature Ideas

This document tracks potential feature additions for the `lean-ctx-vscode` extension project.

## 1. Interactive Context Pinning & Overlay Manager
* **Overview**: UI tab in the sidebar listing active workspace files. Click to "pin" (apply an overlay) or "exclude" them from the context.
* **Benefit**: Streamlines active context engineering visually.

## 2. Live Token Budget & Warning Alerts
* **Overview**: Configure a token budget (e.g., 30k tokens). Status Bar and Dashboard warn the user when current active context sizes approach the limit.
* **Benefit**: Prevents accidental cost spikes before invoking agents.

## 3. Model Savings Simulator (Pricing Presets)
* **Overview**: Pricing simulator extensions with presets for popular models (Gemini 1.5 Pro, Claude 3.5 Sonnet, GPT-4o).
* **Benefit**: Instantly updates calculated USD saved and ROI based on the selected model's pricing.

## 4. Interactive Template Pack Gallery
* **Overview**: Sidebar tab to browse, search, and import `lean-ctx` template presets (e.g., Rust, Next.js, Python Data Science) with one click.
* **Benefit**: Eases configuration of project rules.

## 5. Markdown Report Exporter (ROI Summary)
* **Overview**: Button to generate and export a structured Markdown report summarizing token reductions, USD saved, and overall ROI.
* **Benefit**: Convenient for sharing progress/savings with teams or in repository docs.
