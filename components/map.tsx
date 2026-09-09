"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Experience } from "@/lib/seed";
import { experiencesToGeoJson } from "@/lib/map-data";

type Props = { experiences: Experience[]; selectedId?: string; onSelect: (id: string) => void };
const SOURCE_ID = "local-tourist-experiences";

export function ExperienceMap({ experiences, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  const readyRef = useRef(false);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: containerRef.current, style: process.env.NEXT_PUBLIC_MAP_STYLE_URL || "https://tiles.openfreemap.org/styles/bright", center: [72.91, 19.02], zoom: 10.3 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    const addLayers = () => {
      if (map.getSource(SOURCE_ID)) return;
      map.addSource(SOURCE_ID, { type: "geojson", data: experiencesToGeoJson(experiences) as GeoJSON.FeatureCollection, cluster: true, clusterMaxZoom: 13, clusterRadius: 48 });
      map.addLayer({ id: "experience-clusters", type: "circle", source: SOURCE_ID, filter: ["has", "point_count"], paint: { "circle-color": "#175CD3", "circle-radius": ["step", ["get", "point_count"], 20, 3, 25, 6, 30], "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 3 } });
      map.addLayer({ id: "experience-cluster-count", type: "symbol", source: SOURCE_ID, filter: ["has", "point_count"], layout: { "text-field": "{point_count_abbreviated}", "text-size": 12 }, paint: { "text-color": "#FFFFFF" } });
      map.addLayer({ id: "experience-points", type: "circle", source: SOURCE_ID, filter: ["!", ["has", "point_count"]], paint: { "circle-color": "#087443", "circle-radius": 9, "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 3 } });
      map.on("click", "experience-clusters", (event) => {
        const feature = map.queryRenderedFeatures(event.point, { layers: ["experience-clusters"] })[0];
        const clusterId = feature.properties?.cluster_id;
        const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
        if (clusterId !== undefined) source.getClusterExpansionZoom(clusterId).then((zoom) => map.easeTo({ center: (feature.geometry as GeoJSON.Point).coordinates as [number, number], zoom })).catch(() => undefined);
      });
      map.on("click", "experience-points", (event) => { const feature = map.queryRenderedFeatures(event.point, { layers: ["experience-points"] })[0]; const id = feature.properties?.id; if (id) onSelectRef.current(String(id)); });
      map.on("mouseenter", "experience-clusters", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "experience-clusters", () => { map.getCanvas().style.cursor = ""; });
      map.on("mouseenter", "experience-points", () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", "experience-points", () => { map.getCanvas().style.cursor = ""; });
      readyRef.current = true;
    };
    map.on("load", addLayers);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; readyRef.current = false; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
    if (source && readyRef.current) source.setData(experiencesToGeoJson(experiences) as GeoJSON.FeatureCollection);
  }, [experiences]);

  useEffect(() => {
    const selected = experiences.find((experience) => experience.id === selectedId);
    if (selected && mapRef.current) mapRef.current.flyTo({ center: selected.coordinates, zoom: 13, duration: 700 });
  }, [experiences, selectedId]);

  return <div ref={containerRef} className="absolute inset-0" aria-label="Mumbai and Navi Mumbai experience map" />;
}
