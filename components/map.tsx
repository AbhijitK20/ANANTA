"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { clusterMarkers } from "@/lib/cluster";
import { demoUserLocation } from "@/lib/location";
import type { Experience } from "@/lib/seed";

type Props = { experiences: Experience[]; selectedId?: string; onSelect: (id: string) => void };

/** Interpolate a position along the straight demo path between two points. */
function pointOnPath(from: [number, number], to: [number, number], t: number): [number, number] {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}

export function ExperienceMap({ experiences, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const routeLayerRef = useRef<{ sourceId: string; layerIds: string[] } | null>(null);
  const dotFrameRef = useRef<number | null>(null);
  const dotMarkerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  const [zoom, setZoom] = useState(10.3);
  const [mapReady, setMapReady] = useState(false);
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
    map.on("load", () => setMapReady(true));
    mapRef.current = map;
    return () => {
      if (dotFrameRef.current !== null) cancelAnimationFrame(dotFrameRef.current);
      markersRef.current.forEach((marker) => marker.remove());
      dotMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fixed demo traveler marker. Never a live geolocation claim.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const element = document.createElement("div");
    element.className = "user-dot";
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", `Fixed demo location: ${demoUserLocation.label}`);
    const marker = new maplibregl.Marker({ element })
      .setLngLat(demoUserLocation.coordinates)
      .setPopup(new maplibregl.Popup({ offset: 14, closeButton: false }).setHTML(`<strong>${demoUserLocation.label}</strong><br/><span>${demoUserLocation.note}</span>`))
      .addTo(map);
    return () => { marker.remove(); };
  }, [mapReady]);

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

  // Demo travel path: dashed line from the fixed demo position to the selected
  // place, with a dot that travels along it. An estimate, never a real route.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (dotFrameRef.current !== null) { cancelAnimationFrame(dotFrameRef.current); dotFrameRef.current = null; }
    dotMarkerRef.current?.remove();
    dotMarkerRef.current = null;

    const cleanup = () => {
      const current = routeLayerRef.current;
      if (!current) return;
      for (const layerId of current.layerIds) { if (map.getLayer(layerId)) map.removeLayer(layerId); }
      if (map.getSource(current.sourceId)) map.removeSource(current.sourceId);
      routeLayerRef.current = null;
    };

    const selected = experiences.find((experience) => experience.id === selectedId);
    if (!selected || selected.coordinates[0] === demoUserLocation.coordinates[0]) { cleanup(); return; }

    const sourceId = "demo-route-line";
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    const lineCoordinates = [demoUserLocation.coordinates, selected.coordinates];
    (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: lineCoordinates } }],
    });
    if (!map.getLayer("demo-route-line-case")) {
      map.addLayer({ id: "demo-route-line-case", type: "line", source: sourceId, paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.8 } });
    }
    if (!map.getLayer("demo-route-line-main")) {
      map.addLayer({ id: "demo-route-line-main", type: "line", source: sourceId, paint: { "line-color": "#175cd3", "line-width": 3, "line-dasharray": [1.5, 1.5] } });
    }
    routeLayerRef.current = { sourceId, layerIds: ["demo-route-line-main", "demo-route-line-case"] };

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion) {
      const element = document.createElement("div");
      element.className = "travel-dot";
      element.setAttribute("role", "presentation");
      const dot = new maplibregl.Marker({ element }).setLngLat(demoUserLocation.coordinates).addTo(map);
      dotMarkerRef.current = dot;
      const start = performance.now();
      const duration = 3200;
      const step = (now: number) => {
        const t = ((now - start) % duration) / duration;
        dot.setLngLat(pointOnPath(demoUserLocation.coordinates, selected.coordinates, t));
        dotFrameRef.current = requestAnimationFrame(step);
      };
      dotFrameRef.current = requestAnimationFrame(step);
    }
    return cleanup;
  }, [experiences, mapReady, selectedId]);

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
