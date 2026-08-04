"use client";

import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const icone = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function MarcadorArrastavel({
  posicao,
  onMudar,
}: {
  posicao: [number, number];
  onMudar: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onMudar(e.latlng.lat, e.latlng.lng);
    },
  });

  return (
    <Marker
      position={posicao}
      icon={icone}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const { lat, lng } = e.target.getLatLng();
          onMudar(lat, lng);
        },
      }}
    />
  );
}

export function MapaLocalizacao({
  latitude,
  longitude,
  onMudar,
}: {
  latitude: number;
  longitude: number;
  onMudar: (lat: number, lng: number) => void;
}) {
  const posicao: [number, number] = [latitude, longitude];

  return (
    <MapContainer
      center={posicao}
      zoom={15}
      style={{ height: "260px", width: "100%", borderRadius: "0.5rem" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MarcadorArrastavel posicao={posicao} onMudar={onMudar} />
    </MapContainer>
  );
}
