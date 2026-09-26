"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { clusterMarkers } from "@/lib/cluster";
import { demoUserLocation } from "@/lib/location";
import { positionAlongRoute, type StreetRoute } from "@/lib/routing";
import type { ExperienceV2 } from "@/lib/engine";

/**
 * Map fixes, all of them honesty or performance.
 *
 * 1. The marker count is capped. `clusterMarkers` returns `undefined` cell size
 *    at zoom 14 and above, which turns clustering off entirely, and the old
 *    caller passed all 1107 records. Selecting a place called `flyTo({ zoom: 13 })`,
 *    one step away. So the caller now hands the map a ranked, capped slice and
 *    the cap is stated on screen. `lib/cluster.ts` also does an `items.find()`
 *    inside a `.map()`, which is the underlying O(n squared); reported as a
 *    blocker because that file is not mine.
 *
 * 2. `Popup.setHTML` is gone. 1107 venue names flowed into an `innerHTML` sink
 *    and `.github/workflows/refresh-geocode.yml` rewrites that data from Overpass
 *    every month, so the data is not even ours to vouch for. `setDOMContent`
 *    with real text nodes cannot execute anything, and a CSP will not break it.
 *
 * 3. Individual markers are real focusable buttons with a label, so the map is
 *    not a keyboard trap. The container `aria-label` came off a plain div, which
 *    is an ARIA lie, and is replaced by a visible note.
 */

const MAX_MARKERS = 250;

type Props = {
  records: ExperienceV2[];
  selectedId?: string;
  onSelect: (id: string) => void;
  route?: StreetRoute | null;
};

export function ExperienceMap({ records, selectedId, onSelect, route }: Props) {
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
  const [dropped, setDropped] = useState(0);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

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
    // Tile or style failures fall back to a visible state, never a blank surface.
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

  // Fixed demo traveller marker. Never a live geolocation claim.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const element = document.createElement("div");
    element.className = "user-dot";
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", `Fixed demo location: ${demoUserLocation.label}`);
    const marker = new maplibregl.Marker({ element })
      .setLngLat(demoUserLocation.coordinates)
      .setPopup(
        new maplibregl.Popup({ offset: 14, closeButton: false }).setDOMContent(
          popupBody(demoUserLocation.label, demoUserLocation.note),
        ),
      )
      .addTo(map);
    return () => {
      marker.remove();
    };
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((marker) => marker.remove());
    const capped = records.slice(0, MAX_MARKERS);
    setDropped(Math.max(0, records.length - capped.length));
    const byId = new Map(capped.map((record) => [record.id, record]));

    markersRef.current = clusterMarkers(
      capped.map(({ id, coordinates }) => ({ id, coordinates })),
      zoom,
    )
      .map((entry) => {
        if (entry.kind === "cluster") {
          const element = document.createElement("button");
          element.type = "button";
          element.className = "cluster-badge";
          element.textContent = String(entry.ids.length);
          element.setAttribute("aria-label", `${entry.ids.length} experiences in this area. Zoom in to expand.`);
          element.addEventListener("click", () =>
            map.flyTo({ center: entry.coordinates, zoom: Math.min(zoom + 2.5, 15), duration: 650 }),
          );
          return new maplibregl.Marker({ element }).setLngLat(entry.coordinates).addTo(map);
        }
        const record = byId.get(entry.id);
        if (!record) return null;

        // A real button, so it is reachable by keyboard and announced with a
        // label. MapLibre gives us the div, we give it the semantics.
        const element = document.createElement("button");
        element.type = "button";
        element.className = "place-pin";
        element.style.setProperty("--pin", record.statusTone === "amber" ? "#A15C07" : record.statusTone === "green" ? "#087443" : "#175CD3");
        element.setAttribute("aria-label", `${record.name}, ${record.area}, ${record.priceInr === 0 ? "free" : `₹${record.priceInr}`}. Select to see why it ranks here.`);
        const popup = new maplibregl.Popup({ offset: 18, closeButton: true }).setDOMContent(
          popupBody(record.name, `${record.area} · ${record.priceInr === 0 ? "Free" : `₹${record.priceInr.toLocaleString("en-IN")}`} · ${record.durationMinutes} min visit`),
        );
        const marker = new maplibregl.Marker({ element }).setLngLat(record.coordinates).setPopup(popup).addTo(map);
        const select = () => onSelectRef.current(record.id);
        element.addEventListener("click", select);
        return marker;
      })
      .filter((marker): marker is maplibregl.Marker => marker !== null);
  }, [records, zoom]);

  useEffect(() => {
    const selected = records.find((record) => record.id === selectedId);
    if (selected && mapRef.current) mapRef.current.flyTo({ center: selected.coordinates, zoom: 13, duration: 700 });
  }, [records, selectedId]);

  // Travel route: draw the real street polyline (or the labeled straight-line
  // fallback), fit the view to it, and move a dot along the actual path. A
  // walking estimate, never a turn-by-turn navigation claim.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (dotFrameRef.current !== null) {
      cancelAnimationFrame(dotFrameRef.current);
      dotFrameRef.current = null;
    }
    dotMarkerRef.current?.remove();
    dotMarkerRef.current = null;

    const cleanup = () => {
      const current = routeLayerRef.current;
      if (!current) return;
      for (const layerId of current.layerIds) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      if (map.getSource(current.sourceId)) map.removeSource(current.sourceId);
      routeLayerRef.current = null;
    };

    if (!route || route.coordinates.length < 2) {
      cleanup();
      return;
    }

    const sourceId = "demo-route-line";
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    }
    (map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: route.coordinates } }],
    });
    if (!map.getLayer("demo-route-line-case")) {
      map.addLayer({ id: "demo-route-line-case", type: "line", source: sourceId, paint: { "line-color": "#ffffff", "line-width": 7, "line-opacity": 0.85 } });
    }
    if (!map.getLayer("demo-route-line-main")) {
      map.addLayer({ id: "demo-route-line-main", type: "line", source: sourceId, paint: { "line-color": route.kind === "street" ? "#175cd3" : "#667085", "line-width": 4 } });
    }
    routeLayerRef.current = { sourceId, layerIds: ["demo-route-line-main", "demo-route-line-case"] };

    const bounds = route.coordinates.reduce(
      (acc, coordinate) => acc.extend(coordinate as [number, number]),
      new maplibregl.LngLatBounds(route.coordinates[0], route.coordinates[0]),
    );
    map.fitBounds(bounds, { padding: 90, duration: 800, maxZoom: 15 });

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reducedMotion) {
      const element = document.createElement("div");
      element.className = "travel-dot";
      element.setAttribute("role", "presentation");
      const dot = new maplibregl.Marker({ element }).setLngLat(route.coordinates[0]).addTo(map);
      dotMarkerRef.current = dot;
      const start = performance.now();
      const duration = 3600;
      const step = (now: number) => {
        const t = ((now - start) % duration) / duration;
        dot.setLngLat(positionAlongRoute(route.coordinates, t));
        dotFrameRef.current = requestAnimationFrame(step);
      };
      dotFrameRef.current = requestAnimationFrame(step);
    }
    return cleanup;
  }, [route, mapReady]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} className="absolute inset-0" />
      <p className="pointer-events-none absolute bottom-3 left-3 max-w-[280px] rounded-md border border-line bg-white/95 px-3 py-2 text-[11px] font-semibold leading-4 text-muted shadow-card">
        The ranked list below is the accessible path. Every pin here is also a labelled button you can tab to.
      </p>
      {dropped > 0 && (
        <p className="pointer-events-none absolute left-3 top-3 rounded-md border border-amber bg-white/95 px-3 py-2 text-[11px] font-semibold leading-4 text-amber shadow-card">
          Showing the top {MAX_MARKERS} of {records.length} passing records. {dropped} more are in the list and the show-more control.
        </p>
      )}
      {tilesFailed && (
        <div role="status" className="absolute right-5 top-5 z-10 border border-amber bg-white p-3 text-xs font-semibold text-ink shadow-card">
          Map tiles could not load right now. The ranked list beside the map stays available, and results are unaffected.
        </div>
      )}
    </div>
  );
}

/** Real nodes, never an HTML string. This is the whole fix for the innerHTML sink. */
function popupBody(title: string, detail: string): HTMLElement {
  const wrapper = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = title;
  const span = document.createElement("span");
  span.textContent = detail;
  wrapper.append(strong, document.createElement("br"), span);
  return wrapper;
}
