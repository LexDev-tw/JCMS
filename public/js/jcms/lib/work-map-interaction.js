/** 工作地圖互動輔助（對齊 Google 我的地圖操作語意） */

export function featureVertices(feat) {
    if (!feat || !feat.coordinates) return [];
    if (feat.type === 'point') {
        return [{ index: 0, coord: feat.coordinates }];
    }
    if (feat.type === 'line' || feat.type === 'polygon') {
        return (feat.coordinates || []).map((coord, index) => ({ index, coord }));
    }
    return [];
}

export function hitTestVertex(map, point, feature, listId, thresholdPx = 10) {
    if (!map || !feature || !listId) return null;
    const verts = featureVertices(feature);
    for (let i = 0; i < verts.length; i += 1) {
        const projected = map.project(verts[i].coord);
        const dx = projected.x - point.x;
        const dy = projected.y - point.y;
        if (Math.hypot(dx, dy) <= thresholdPx) {
            return { featureId: feature.id, vertexIndex: verts[i].index };
        }
    }
    return null;
}

export function applyCoordToFeature(feat, vertexIndex, lngLat) {
    if (!feat) return;
    if (feat.type === 'point') {
        feat.coordinates = lngLat;
        return;
    }
    if (Array.isArray(feat.coordinates) && vertexIndex >= 0 && vertexIndex < feat.coordinates.length) {
        feat.coordinates[vertexIndex] = lngLat;
    }
}

export function moveFeatureByDelta(feat, fromLngLat, toLngLat) {
    if (!feat || !fromLngLat || !toLngLat) return;
    const dLng = toLngLat[0] - fromLngLat[0];
    const dLat = toLngLat[1] - fromLngLat[1];
    if (!dLng && !dLat) return;
    if (feat.type === 'point') {
        feat.coordinates = [feat.coordinates[0] + dLng, feat.coordinates[1] + dLat];
        return;
    }
    if (Array.isArray(feat.coordinates)) {
        feat.coordinates = feat.coordinates.map(([lng, lat]) => [lng + dLng, lat + dLat]);
    }
}
