"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  LOCATION_ADDRESS_FALLBACK,
  LOCATION_ADDRESS_PENDING,
} from "@/src/lib/locationLabels";
import {
  MVP_WANGJING_SOHO_LAT,
  MVP_WANGJING_SOHO_LON,
} from "@/src/lib/mvpLocation";

const DEFAULT_CENTER: [number, number] = [
  MVP_WANGJING_SOHO_LAT,
  MVP_WANGJING_SOHO_LON,
];

const MAP_HINT = "点击地图或拖动图钉选点";

function createIcon() {
  return L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    iconRetinaUrl:
      "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });
}

function MapClickHandler({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function Recenter({ position }: { position: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(position, Math.max(map.getZoom(), 15), {
      animate: true,
      duration: 0.22,
    });
  }, [position, map]);
  return null;
}

interface ManualLocationMapProps {
  onConfirm: (lat: number, lon: number, address: string) => void;
  onBack: () => void;
}

export default function ManualLocationMap({
  onConfirm,
  onBack,
}: ManualLocationMapProps) {
  const icon = useMemo(() => createIcon(), []);
  const [position, setPosition] = useState<[number, number]>(DEFAULT_CENTER);
  const [address, setAddress] = useState<string>(MAP_HINT);
  const [loadingAddr, setLoadingAddr] = useState(false);

  const fetchAddress = useCallback(async (lat: number, lon: number) => {
    setLoadingAddr(true);
    try {
      const res = await fetch(
        `/api/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lon))}`,
      );
      const data = (await res.json()) as { address?: string };
      const next = data.address?.trim();
      setAddress(next && next.length > 0 ? next : LOCATION_ADDRESS_FALLBACK);
    } catch {
      setAddress(LOCATION_ADDRESS_FALLBACK);
    } finally {
      setLoadingAddr(false);
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchAddress(position[0], position[1]);
    }, 350);
    return () => window.clearTimeout(t);
  }, [position, fetchAddress]);

  const handleMapPick = useCallback((lat: number, lng: number) => {
    setPosition([lat, lng]);
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-gray-600">
        拖动图钉或点击地图，精确选择出发位置
      </p>
      <div className="overflow-hidden rounded-xl ring-1 ring-gray-200">
        <MapContainer
          center={position}
          zoom={16}
          className="h-[220px] w-full"
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onPick={handleMapPick} />
          <Recenter position={position} />
          <Marker
            position={position}
            icon={icon}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const m = e.target as L.Marker;
                const { lat, lng } = m.getLatLng();
                setPosition([lat, lng]);
              },
            }}
          />
        </MapContainer>
      </div>
      <div className="rounded-xl bg-gray-50 px-3 py-2 text-xs leading-relaxed text-gray-600">
        {loadingAddr ? LOCATION_ADDRESS_PENDING : address}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 cursor-pointer rounded-xl bg-gray-100 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
        >
          返回
        </button>
        <button
          type="button"
          onClick={() => {
            const label =
              loadingAddr ||
              address === MAP_HINT ||
              !address.trim()
                ? LOCATION_ADDRESS_FALLBACK
                : address;
            onConfirm(position[0], position[1], label);
          }}
          className="flex-1 cursor-pointer rounded-xl bg-blue-500 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-600"
        >
          确认此位置
        </button>
      </div>
    </div>
  );
}
