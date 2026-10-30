"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import * as maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { SERIES } from "@/components/charts";

export type Gap = {
  communityId: string;
  community: string;
  communityLat: number;
  communityLng: number;
  serviceType: string;
  provider: string;
  providerLat: number;
  providerLng: number;
  km: number;
  minutes: number;
};

export const SERVICE_LABELS: Record<string, string> = {
  clinic: "Clinic",
  dental: "Dental",
  hospital: "Hospital",
  legal: "Legal aid",
  housing: "Housing",
  transport: "Transport",
  mental_health: "Mental health",
};

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

const fmtTime = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

/** OpenStreetMap raster tiles: no Google services in the request path. */
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm", paint: { "raster-saturation": -0.6 } }],
};

export function ServiceMap({ gaps }: { gaps: Gap[] }) {
  const types = useMemo(() => [...new Set(gaps.map((g) => g.serviceType))], [gaps]);
  const [type, setType] = useState(types.includes("dental") ? "dental" : types[0]);
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const selected = useMemo(() => gaps.filter((g) => g.serviceType === type), [gaps, type]);

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({ container: container.current, style: STYLE, center: [134.9, -22.3], zoom: 5.2 });
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    m.on("load", () => {
      m.addSource("routes", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addLayer({
        id: "routes",
        type: "line",
        source: "routes",
        paint: { "line-color": "#5e5a52", "line-width": 2, "line-dasharray": [2, 2] },
      });
      setReady(true);
    });
    map.current = m;
    // The grid column settles after mount; keep the canvas matched to it.
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(container.current);
    return () => {
      observer.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    markers.current.forEach((mk) => mk.remove());
    markers.current = [];
    const dot = (color: string, size: number, label: string) => {
      const el = document.createElement("div");
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.3)`;
      el.setAttribute("aria-label", label);
      return el;
    };
    const providers = new Map(selected.map((g) => [g.provider, g]));
    for (const g of providers.values()) {
      markers.current.push(
        new maplibregl.Marker({ element: dot(SERIES[2], 14, g.provider) })
          .setLngLat([g.providerLng, g.providerLat])
          .setPopup(new maplibregl.Popup({ offset: 10 }).setText(`${g.provider} (${SERVICE_LABELS[g.serviceType] ?? g.serviceType})`))
          .addTo(m),
      );
    }
    for (const g of selected) {
      markers.current.push(
        new maplibregl.Marker({ element: dot(SERIES[0], 18, g.community) })
          .setLngLat([g.communityLng, g.communityLat])
          .setPopup(new maplibregl.Popup({ offset: 12 }).setText(`${g.community}: ${g.km} km, about ${fmtTime(g.minutes)} to ${g.provider}`))
          .addTo(m),
      );
    }
    (m.getSource("routes") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: selected.map((g) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [[g.communityLng, g.communityLat], [g.providerLng, g.providerLat]] },
      })),
    });
    const bounds = new maplibregl.LngLatBounds();
    for (const g of selected) bounds.extend([g.communityLng, g.communityLat]).extend([g.providerLng, g.providerLat]);
    if (!bounds.isEmpty()) m.fitBounds(bounds, { padding: 70, maxZoom: 8, duration: 0 });
  }, [selected, ready]);

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Service type" className="flex flex-wrap gap-1">
        {types.map((t) => (
          <button
            key={t}
            role="radio"
            aria-checked={t === type}
            onClick={() => setType(t)}
            className={`rounded-full border px-3 py-1 text-sm ${t === type ? "border-accent bg-accent-soft text-accent-strong" : "border-line-strong text-ink-muted hover:bg-sunken"}`}
          >
            {SERVICE_LABELS[t] ?? t}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div ref={container} className="h-[420px] overflow-hidden rounded-xl border border-line" />
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2 text-sm">
            {[...selected].sort((a, b) => b.minutes - a.minutes).map((g) => (
              <li key={g.communityId} className="flex flex-col rounded-lg border border-line bg-surface p-3">
                <span className="font-medium">{g.community}</span>
                <span className="text-ink-muted">
                  {g.km} km · about {fmtTime(g.minutes)}
                </span>
                <span className="text-xs text-ink-faint">Nearest: {g.provider}</span>
              </li>
            ))}
          </ul>
          <ul className="flex flex-col gap-1 text-xs text-ink-muted">
            <li className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: SERIES[0] }} />Community</li>
            <li className="flex items-center gap-2"><span className="size-3 rounded-full" style={{ background: SERIES[2] }} />Nearest service</li>
          </ul>
          <p className="text-xs text-ink-faint">Straight-line distance; travel time assumes remote roads at ~1.3× that distance and 80 km/h.</p>
          <p className="text-xs text-ink-faint">Demo data: communities and services are fictional, placed at illustrative locations.</p>
        </div>
      </div>
    </div>
  );
}
