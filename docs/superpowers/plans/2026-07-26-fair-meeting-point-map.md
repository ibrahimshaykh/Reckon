# Fair Meeting Point Visual Map Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace the text-only "~X km total travel" line on the Proposals page with a real interactive map showing every member's home and every geolocated proposal, with the fairest pick visually distinguished — while keeping the existing "Directions" deep-link hand-off to real Google Maps unchanged.

**Architecture:** `react-leaflet` renders an OpenStreetMap-tiled map as a Client Component. `listProposals` (already computing coordinates, distances, and the fairest pick) is extended to also return each member's home coordinates in the same call, so the map needs no extra fetch. No new Server Actions — this is a rendering addition on top of Task 6 of the Tier 3 plan.

**Tech Stack:** `leaflet`, `react-leaflet` (both free, no API key, no card on file — OpenStreetMap tiles under their standard usage policy).

## Global Constraints

- No Google Maps JS API — that requires a billing account/card, which this project has avoided everywhere else ($0/no-card rule, same reasoning as the haversine-instead-of-Distance-Matrix decision).
- Leaflet must never render during SSR (it touches `window`/`document` at import time) — the map component is Client-Component-only and its default marker icon paths must be explicitly fixed (a well-known break under Next's bundler), not left broken.
- The existing "Directions" deep link (opens real Google Maps) stays exactly as is — the map is additive visualization, not a replacement for actual navigation.

---

### Task 1: Install Leaflet + fix marker icons

**Files:**
- Modify: `package.json` (add `leaflet`, `react-leaflet`)
- Create: `src/lib/leaflet-icon-fix.ts`

**Interfaces:**
- Produces: `fixLeafletIcons()` — call once before rendering any `<Marker>`.

- [ ] **Step 1: Install** — `npm install leaflet react-leaflet --legacy-peer-deps`.

- [ ] **Step 2** — `src/lib/leaflet-icon-fix.ts`:

```ts
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet's default marker icon paths are computed relative to its own CSS
// file location, which breaks once bundled by Next.js — this points them at
// the actual bundled asset URLs instead. Must run once before any <Marker>
// renders, and only on the client (Leaflet touches `window`).
export function fixLeafletIcons() {
  // @ts-expect-error -- _getIconUrl is a private field Leaflet expects callers to delete
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x.src,
    iconUrl: markerIcon.src,
    shadowUrl: markerShadow.src,
  });
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean.

- [ ] **Step 4: Commit** — `feat: install Leaflet and fix default marker icons for Next.js`.

---

### Task 2: Extend listProposals with member home coordinates

**Files:**
- Modify: `src/lib/actions/proposals.ts`

**Interfaces:**
- Modifies: `listProposals(groupId)` to also return `memberHomes: { userId, displayName, latitude, longitude }[]` (only members who have set home coordinates).

- [ ] **Step 1** — in `listProposals`, after computing `homes` (already fetched from `members`), build and return the labeled version alongside the existing proposal list:

```ts
const memberHomes = members
  .filter((m) => m.user.homeLatitude !== null && m.user.homeLongitude !== null)
  .map((m) => ({
    userId: m.userId,
    displayName: m.user.displayName,
    latitude: m.user.homeLatitude!,
    longitude: m.user.homeLongitude!,
  }));

return {
  proposals: proposals.map((p) => {
    /* ...unchanged per-proposal mapping from Tier 3 Task 6... */
  }),
  memberHomes,
};
```

(This changes the return shape from an array to `{ proposals, memberHomes }` — update the one caller, `src/app/groups/[groupId]/proposals/page.tsx`, in Task 3.)

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean (will show the call-site type error until Task 3's page update, which is expected mid-task).

- [ ] **Step 3: Commit** — deferred to the end of Task 3, since the type change isn't self-consistent until the page is updated too.

---

### Task 3: Map component + wiring into the Proposals page

**Files:**
- Create: `src/components/proposals/meeting-point-map.tsx`
- Modify: `src/app/groups/[groupId]/proposals/page.tsx`

**Interfaces:**
- Consumes: `memberHomes`, and proposals with `latitude`/`longitude`/`totalDistanceKm`/`isFairestPick` from Task 2.

- [ ] **Step 1** — `src/components/proposals/meeting-point-map.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { fixLeafletIcons } from "@/lib/leaflet-icon-fix";
import "leaflet/dist/leaflet.css";

type Home = { userId: string; displayName: string; latitude: number; longitude: number };
type ProposalPin = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  totalDistanceKm: number | null;
  isFairestPick: boolean;
};

export function MeetingPointMap({
  homes,
  proposals,
}: {
  homes: Home[];
  proposals: ProposalPin[];
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fixLeafletIcons();
    setReady(true);
  }, []);

  const points = [
    ...homes.map((h) => [h.latitude, h.longitude] as [number, number]),
    ...proposals.map((p) => [p.latitude, p.longitude] as [number, number]),
  ];
  if (!ready || points.length === 0) return null;

  const center = points[0];

  return (
    <MapContainer
      center={center}
      zoom={11}
      scrollWheelZoom={false}
      style={{ height: "300px", width: "100%", borderRadius: "0.5rem" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {homes.map((h) => (
        <Marker key={h.userId} position={[h.latitude, h.longitude]}>
          <Popup>{h.displayName}&apos;s home</Popup>
        </Marker>
      ))}
      {proposals.map((p) => (
        <Marker key={p.id} position={[p.latitude, p.longitude]}>
          <Popup>
            <strong>{p.title}</strong>
            {p.isFairestPick && " — fairest pick"}
            {p.totalDistanceKm !== null && (
              <>
                <br />~{p.totalDistanceKm.toFixed(1)} km total travel
                <br />
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Directions
                </a>
              </>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
```

- [ ] **Step 2** — modify `src/app/groups/[groupId]/proposals/page.tsx`: destructure `{ proposals, memberHomes }` from `listProposals`, render `<MeetingPointMap homes={memberHomes} proposals={proposals.filter((p) => p.latitude !== null && p.longitude !== null).map(...)} />` above `<ProposalList proposals={proposals} />`, only rendering the map section when `memberHomes.length > 0`.

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm run build` clean.

- [ ] **Step 4: Verify live** — dev server, visit the Proposals page for the group with home coordinates and geolocated proposals already set up (from Tier 3 Task 6's testing), confirm: the map renders visually (not blank), a marker sits at the member's home, markers sit at both proposal locations, clicking the fairest-pick marker's popup shows "fairest pick" and the correct distance, the popup's "Directions" link matches the same URL the old text-only version produced.

- [ ] **Step 5: Commit** — `feat: visual meeting-point map with Leaflet + OpenStreetMap` (includes Task 2's return-shape change, committed together since they're only type-consistent as a pair).

---

## Self-Review

- **Spec coverage:** Fulfills the revised feature #14 (visual map, not just a distance number), per the 2026-07-26 spec update.
- **Placeholders:** none — every step has concrete code.
- **Type consistency:** `listProposals`'s new `{ proposals, memberHomes }` shape is introduced in Task 2 and consumed exactly that way in Task 3 — the one call site is updated in the same commit.
- **Known simplification:** the map recenters on the first home/proposal point rather than auto-fitting bounds to all markers — acceptable for a handful of markers in a single city; would need `map.fitBounds()` if usage grows to widely-scattered groups.
