"use client";

import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { defaultMarkerIcon } from "@/lib/leaflet-icon-fix";
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

export function MeetingPointMap({
  homes,
  proposals,
  dict,
}: {
  homes: Home[];
  proposals: ProposalPin[];
  dict: Dictionary;
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
          <Popup>{h.displayName}{dict.proposals.homeSuffix}</Popup>
        </Marker>
      ))}
      {proposals.map((p) => (
        <Marker key={p.id} position={[p.latitude, p.longitude]} icon={defaultMarkerIcon}>
          <Popup>
            <strong>{p.title}</strong>
            {p.isFairestPick && dict.proposals.fairestPickMapSuffix}
            {p.totalDistanceKm !== null && (
              <>
                <br />
                {interpolate(dict.proposals.totalTravel, { km: p.totalDistanceKm.toFixed(1) })}
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
  );
}
