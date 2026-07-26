"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { defaultMarkerIcon } from "@/lib/leaflet-icon-fix";
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
  const points = [
    ...homes.map((h) => [h.latitude, h.longitude] as [number, number]),
    ...proposals.map((p) => [p.latitude, p.longitude] as [number, number]),
  ];
  if (points.length === 0) return null;

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
        <Marker key={h.userId} position={[h.latitude, h.longitude]} icon={defaultMarkerIcon}>
          <Popup>{h.displayName}&apos;s home</Popup>
        </Marker>
      ))}
      {proposals.map((p) => (
        <Marker key={p.id} position={[p.latitude, p.longitude]} icon={defaultMarkerIcon}>
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
