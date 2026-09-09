export type ClusterInput = { id: string; coordinates: [number, number] };

export type ClusterPoint = { kind: "point"; id: string; coordinates: [number, number] };
export type ClusterGroup = { kind: "cluster"; coordinates: [number, number]; ids: string[] };
export type ClusterOutput = ClusterPoint | ClusterGroup;

/**
 * Grid cell width per map zoom. The metro area spans roughly 0.3 degrees, so
 * cells stay small enough to separate neighborhoods at city zoom; past zoom 14
 * markers render individually. Pure and deterministic.
 */
export function cellSizeForZoom(zoom: number): number | undefined {
  if (zoom >= 14) return undefined;
  if (zoom >= 12) return 0.05;
  if (zoom >= 10) return 0.1;
  return 0.5;
}

/** Groups nearby markers into grid cells at low zoom; passes markers through when zoomed in. */
export function clusterMarkers(items: ClusterInput[], zoom: number): ClusterOutput[] {
  const cell = cellSizeForZoom(zoom);
  if (!cell) return items.map((item) => ({ kind: "point" as const, id: item.id, coordinates: item.coordinates }));

  const groups = new Map<string, { ids: string[]; lngSum: number; latSum: number }>();
  for (const item of items) {
    const [lng, lat] = item.coordinates;
    const key = `${Math.floor(lng / cell)}:${Math.floor(lat / cell)}`;
    const group = groups.get(key) ?? { ids: [], lngSum: 0, latSum: 0 };
    group.ids.push(item.id);
    group.lngSum += lng;
    group.latSum += lat;
    groups.set(key, group);
  }

  return Array.from(groups.values()).map((group) =>
    group.ids.length === 1
      ? { kind: "point" as const, id: group.ids[0], coordinates: items.find((item) => item.id === group.ids[0])!.coordinates }
      : { kind: "cluster" as const, coordinates: [group.lngSum / group.ids.length, group.latSum / group.ids.length] as [number, number], ids: group.ids },
  );
}
