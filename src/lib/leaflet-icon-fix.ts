import L from "leaflet";

// Leaflet's default marker icon resolves its image paths relative to its own
// CSS file location, which breaks once bundled by Next.js. Importing the PNGs
// as bundled assets from node_modules turned out unreliable under Turbopack
// (the resulting URL wasn't usable by the Icon). Pointing directly at the
// same files served from unpkg's CDN — pinned to the installed Leaflet
// version — sidesteps the bundler entirely; it's a static asset fetch, not a
// paid API, so it doesn't touch the $0/no-card rule.
export const defaultMarkerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
