"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window` at module-evaluation time, which crashes during
// Next's server-side render of this Client Component (the App Router still
// renders "use client" components on the server once for the initial HTML).
// ssr: false skips that server pass entirely — the map only ever mounts in
// the browser.
export const MeetingPointMap = dynamic(
  () => import("./meeting-point-map").then((mod) => mod.MeetingPointMap),
  { ssr: false },
);
