"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { clusterMarkers } from "@/lib/cluster";
import type { Experience } from "@/lib/seed";

type Props = { experiences: Experience[]; selectedId?: string; onSelect: (id: string) => void };

export function ExperienceMap({ experiences, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const onSelectRef = useRef(onSelect);
  const [zoom, setZoom] = useState(10.3);
  const [tilesFailed, setTilesFailed] = useState(false);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/bright",
      center: [72.91, 19.02],
      zoom: 10.3,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.on("moveend", () => setZoom(map.getZoom()));
    // Tile or style failures fall back to a visible state instead of a blank surface.
    map.on("error", () => setTilesFailed(true));
    mapRef.current = map;
    return () => { markersRef.current.forEach((marker) => marker.remove()); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    const byId = new Map(experiences.map((experience) => [experience.id, experience]));
    markersRef.current = clusterMarkers(experiences.map(({ id, coordinates }) => ({ id, coordinates })), zoom).map((entry) => {
      if (entry.kind === "cluster") {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "cluster-badge";
        element.textContent = String(entry.ids.length);
        element.setAttribute("aria-label", `${entry.ids.length} experiences in this area. Zoom in to expand.`);
        element.addEventListener("click", () => map.flyTo({ center: entry.coordinates, zoom: Math.min(zoom + 2.5, 15), duration: 650 }));
        return new maplibregl.Marker({ element }).setLngLat(entry.coordinates).addTo(map);
      }
      const experience = byId.get(entry.id);
      if (!experience) return null;
      const marker = new maplibregl.Marker({ color: experience.statusTone === "amber" ? "#A15C07" : experience.statusTone === "green" ? "#087443" : "#175CD3" })
        .setLngLat(experience.coordinates)
        .setPopup(new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(`<strong>${experience.name}</strong><br/><span>${experience.area} · ${experience.price}</span>`))
        .addTo(map);
      marker.getElement().addEventListener("click", () => onSelectRef.current(experience.id));
      return marker;
    }).filter((marker): marker is maplibregl.Marker => marker !== null);
  }, [experiences, zoom]);

  useEffect(() => {
    const selected = experiences.find((experience) => experience.id === selectedId);
    if (selected && mapRef.current) mapRef.current.flyTo({ center: selected.coordinates, zoom: 13, duration: 700 });
  }, [experiences, selectedId]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" aria-label="Mumbai and Navi Mumbai experience map" />
      {tilesFailed && (
        <div role="status" className="absolute left-5 right-5 top-5 z-10 border border-amber bg-white p-3 text-xs font-semibold text-ink shadow-card">
          Map tiles could not load right now. The ranked list beside the map stays available, and results are unaffected.
        </div>
      )}
    </div>
  );
}
