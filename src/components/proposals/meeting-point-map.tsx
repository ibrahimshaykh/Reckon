"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useTheme } from "next-themes";
import { Expand, Locate, Minimize2, Search } from "lucide-react";
import type { Dictionary } from "@/lib/dictionary";
import { interpolate } from "@/lib/i18n";
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

// Markers are drawn as DOM, not image sprites, so they inherit the theme's
// own colours and can carry a label without shipping extra assets.
function pinIcon({
  label,
  tone,
  ring,
}: {
  label: string;
  tone: string;
  ring?: boolean;
}) {
  return L.divIcon({
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16],
    html: `<span style="
      display:grid;place-items:center;
      width:28px;height:28px;border-radius:9999px;
      background:${tone};color:#fff;
      font:600 11px/1 ui-sans-serif,system-ui,sans-serif;
      box-shadow:0 0 0 ${ring ? "4px" : "2px"} ${ring ? "rgba(255,255,255,.55)" : "rgba(0,0,0,.18)"},
                 0 6px 16px -4px rgba(0,0,0,.45);
    ">${label}</span>`,
  });
}

// Keeps every home and proposal inside the viewport, so the map never opens
// showing an arbitrary first point with the rest off screen.
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [42, 42], maxZoom: 14 });
  }, [map, points]);
  return null;
}

// Scrolling over the map moves the map, in whatever direction you scroll —
// the pointer drags the world rather than the page. Zoom is deliberately not
// on the wheel by default: it's behind the zoom toggle (or ctrl/⌘+scroll),
// so a stray scroll can never blow the framing away.
function WheelControl({ zoomMode }: { zoomMode: boolean }) {
  const map = useMap();

  useEffect(() => {
    const el = map.getContainer();

    // Touchpads rarely report a clean diagonal: Windows precision pads tend
    // to emit alternating axis-pure events (one horizontal, the next
    // vertical) rather than one event carrying both. Panning per-event
    // therefore reads as a cardinal zigzag. Feeding deltas into a velocity
    // that decays over a few frames blends those alternating events back
    // into the diagonal the fingers actually described — and gives the pan
    // some weight as a side effect.
    let velX = 0;
    let velY = 0;
    let carryX = 0;
    let carryY = 0;
    let frame: number | null = null;

    const glide = () => {
      // Sub-pixel remainder is carried between frames, since Leaflet rounds
      // whatever offset it's handed and would otherwise discard slow drift.
      carryX += velX * 0.28;
      carryY += velY * 0.28;

      const stepX = Math.trunc(carryX);
      const stepY = Math.trunc(carryY);
      if (stepX || stepY) {
        carryX -= stepX;
        carryY -= stepY;
        map.panBy([stepX, stepY], { animate: false });
      }

      velX *= 0.86;
      velY *= 0.86;

      if (Math.abs(velX) > 0.05 || Math.abs(velY) > 0.05) {
        frame = requestAnimationFrame(glide);
      } else {
        velX = velY = 0;
        frame = null;
      }
    };

    // Deltas arrive in different units depending on the device; normalise
    // line- and page-based wheels to something comparable to pixels.
    const toPixels = (value: number, mode: number) =>
      mode === 1 ? value * 16 : mode === 2 ? value * 400 : value;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (zoomMode || e.ctrlKey || e.metaKey) {
        velX = velY = carryX = carryY = 0;
        const point = map.mouseEventToContainerPoint(e);
        const direction = e.deltaY < 0 ? 1 : -1;
        map.setZoomAround(
          map.containerPointToLatLng(point),
          map.getZoom() + direction * 0.6,
          { animate: true },
        );
        return;
      }

      let dx = toPixels(e.deltaX, e.deltaMode);
      let dy = toPixels(e.deltaY, e.deltaMode);

      // Shift redirects a wheel's single vertical axis onto the horizontal
      // one, so a plain mouse can pan sideways as well.
      if (e.shiftKey && !e.deltaX) {
        dx = dy;
        dy = 0;
      }

      velX += dx;
      velY += dy;
      if (frame === null) frame = requestAnimationFrame(glide);
    };

    // Non-passive so preventDefault actually holds, and capture so the
    // page's smooth-scroll library doesn't claim the gesture first.
    el.addEventListener("wheel", onWheel, { passive: false, capture: true });
    return () => {
      el.removeEventListener("wheel", onWheel, { capture: true });
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [map, zoomMode]);

  return null;
}

function MapActions({
  points,
  expanded,
  onToggleExpand,
  zoomMode,
  onToggleZoomMode,
}: {
  points: [number, number][];
  expanded: boolean;
  onToggleExpand: () => void;
  zoomMode: boolean;
  onToggleZoomMode: () => void;
}) {
  const map = useMap();

  useEffect(() => {
    // The container changed size — Leaflet needs telling, or tiles grey out.
    const id = setTimeout(() => map.invalidateSize(), 260);
    return () => clearTimeout(id);
  }, [map, expanded]);

  const fit = () => {
    if (points.length === 1) map.setView(points[0], 13);
    else map.fitBounds(L.latLngBounds(points), { padding: [42, 42], maxZoom: 14 });
  };

  return (
    <div className="absolute right-3 top-3 z-[400] flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onToggleZoomMode}
        title={zoomMode ? "Scroll pans the map" : "Scroll zooms the map"}
        aria-label={zoomMode ? "Switch scroll to panning" : "Switch scroll to zooming"}
        aria-pressed={zoomMode}
        className={`grid size-9 place-items-center rounded-xl border shadow-lg backdrop-blur transition-colors ${
          zoomMode
            ? "border-primary bg-primary text-primary-foreground"
            : "border-rule bg-card/85 text-foreground hover:bg-accent"
        }`}
      >
        <Search className="size-4" />
      </button>
      <button
        type="button"
        onClick={fit}
        title="Frame everyone"
        aria-label="Frame everyone"
        className="grid size-9 place-items-center rounded-xl border border-rule bg-card/85 text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent"
      >
        <Locate className="size-4" />
      </button>
      <button
        type="button"
        onClick={onToggleExpand}
        title={expanded ? "Shrink map" : "Expand map"}
        aria-label={expanded ? "Shrink map" : "Expand map"}
        className="grid size-9 place-items-center rounded-xl border border-rule bg-card/85 text-foreground shadow-lg backdrop-blur transition-colors hover:bg-accent"
      >
        {expanded ? <Minimize2 className="size-4" /> : <Expand className="size-4" />}
      </button>
    </div>
  );
}

export function MeetingPointMap({
  homes,
  proposals,
  dict,
}: {
  homes: Home[];
  proposals: ProposalPin[];
  dict: Dictionary;
}) {
  const { resolvedTheme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [zoomMode, setZoomMode] = useState(false);

  const points = useMemo(
    () => [
      ...homes.map((h) => [h.latitude, h.longitude] as [number, number]),
      ...proposals.map((p) => [p.latitude, p.longitude] as [number, number]),
    ],
    [homes, proposals],
  );

  if (points.length === 0) return null;

  // CARTO's basemaps are free and keyless, and ship a matching dark variant —
  // plain OSM tiles have no dark version and glare against the dark theme.
  const dark = resolvedTheme === "dark";
  const tileUrl = dark
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  return (
    <figure className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-xl border border-rule [&_.leaflet-grab]:cursor-grab [&_.leaflet-dragging_.leaflet-grab]:cursor-grabbing">
        <MapContainer
          center={points[0]}
          zoom={11}
          zoomControl={false}
          scrollWheelZoom={false}
          style={{
            height: expanded ? 520 : 300,
            width: "100%",
            transition: "height .25s cubic-bezier(.22,1,.36,1)",
            background: "transparent",
          }}
        >
          <TileLayer
            key={dark ? "dark" : "light"}
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url={tileUrl}
          />
          <FitBounds points={points} />
          <WheelControl zoomMode={zoomMode} />
          <MapActions
            points={points}
            expanded={expanded}
            onToggleExpand={() => setExpanded((v) => !v)}
            zoomMode={zoomMode}
            onToggleZoomMode={() => setZoomMode((v) => !v)}
          />

          {homes.map((h) => (
            <Marker
              key={h.userId}
              position={[h.latitude, h.longitude]}
              icon={pinIcon({
                label: h.displayName.slice(0, 1).toUpperCase(),
                tone: "oklch(0.55 0.16 225)",
              })}
            >
              <Popup>
                {h.displayName}
                {dict.proposals.homeSuffix}
              </Popup>
            </Marker>
          ))}

          {proposals.map((p, i) => (
            <Marker
              key={p.id}
              position={[p.latitude, p.longitude]}
              icon={pinIcon({
                label: String(i + 1),
                tone: p.isFairestPick
                  ? "oklch(0.56 0.15 165)"
                  : "oklch(0.57 0.19 350)",
                ring: p.isFairestPick,
              })}
            >
              <Popup>
                <strong>{p.title}</strong>
                {p.isFairestPick && dict.proposals.fairestPickMapSuffix}
                {p.totalDistanceKm !== null && (
                  <>
                    <br />
                    {interpolate(dict.proposals.totalTravel, {
                      km: p.totalDistanceKm.toFixed(1),
                    })}
                    <br />
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {dict.common.directions}
                    </a>
                  </>
                )}
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        <p className="pointer-events-none absolute left-3 top-3 z-[400] rounded-lg border border-rule bg-card/85 px-2.5 py-1.5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted-foreground shadow-lg backdrop-blur">
          {zoomMode ? "Scroll to zoom" : "Two-finger scroll to move · ⌘/ctrl to zoom"}
        </p>
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: "oklch(0.55 0.16 225)" }}
          />
          Homes
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: "oklch(0.57 0.19 350)" }}
          />
          Proposed
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: "oklch(0.56 0.15 165)" }}
          />
          Fairest pick
        </span>
      </figcaption>
    </figure>
  );
}
