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
