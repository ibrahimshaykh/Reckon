"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { useTheme } from "next-themes";
import { Expand, Locate, Minimize2 } from "lucide-react";
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

// Scroll-zoom stays off until the map is clicked, so scrolling the page over
// a map doesn't trap the scroll — then it behaves like any modern map.
function DeferredScrollZoom({ onActivate }: { onActivate: () => void }) {
  const map = useMap();
  useEffect(() => {
    const enable = () => {
      map.scrollWheelZoom.enable();
      onActivate();
    };
    map.on("click", enable);
    map.on("mouseout", () => map.scrollWheelZoom.disable());
    return () => {
      map.off("click", enable);
    };
  }, [map, onActivate]);
  return null;
}

function MapActions({
  points,
  expanded,
  onToggleExpand,
}: {
  points: [number, number][];
  expanded: boolean;
  onToggleExpand: () => void;
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
  const [interactive, setInteractive] = useState(false);

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
      <div className="relative overflow-hidden rounded-xl border border-rule">
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
          <DeferredScrollZoom onActivate={() => setInteractive(true)} />
          <MapActions
            points={points}
            expanded={expanded}
            onToggleExpand={() => setExpanded((v) => !v)}
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

        {!interactive && (
          <p className="pointer-events-none absolute left-3 top-3 z-[400] rounded-lg border border-rule bg-card/85 px-2.5 py-1.5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-muted-foreground shadow-lg backdrop-blur">
            Click to zoom with scroll
          </p>
        )}
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
