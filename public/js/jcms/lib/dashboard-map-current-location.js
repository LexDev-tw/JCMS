/** 地圖總覽／工作地圖：現在位置標記（HTML Marker，不受圖層堆疊影響） */
(function (global) {
    const markerByMap = new WeakMap();

    function createMarkerElement() {
        const el = document.createElement('div');
        el.className = 'jcms-current-location-marker';
        el.setAttribute('aria-hidden', 'true');
        el.style.cssText = [
            'width:14px',
            'height:14px',
            'border-radius:50%',
            'background:#f05a28',
            'border:1.5px solid #ffffff',
            'box-shadow:0 0 0 1px rgba(17,17,17,0.12)',
            'pointer-events:none',
            'animation:jcms-current-location-blink 2.8s ease-in-out infinite',
        ].join(';');
        return el;
    }

    function readCoords(location) {
        const lng = Number(location?.lng ?? location?.coordinates?.[0]);
        const lat = Number(location?.lat ?? location?.coordinates?.[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
            return null;
        }
        return [lng, lat];
    }

    function clearCurrentLocationMarker(map) {
        if (!map) return;
        const marker = markerByMap.get(map);
        if (!marker) return;
        marker.remove();
        markerByMap.delete(map);
    }

    function syncCurrentLocation(map, location) {
        if (!map || typeof maplibregl === 'undefined') return;

        const coords = readCoords(location);
        if (!coords) {
            clearCurrentLocationMarker(map);
            return;
        }

        let marker = markerByMap.get(map);
        if (!marker) {
            marker = new maplibregl.Marker({
                element: createMarkerElement(),
                anchor: 'center',
            });
            markerByMap.set(map, marker);
        }

        marker.setLngLat(coords).addTo(map);
    }

    function createCurrentLocationApi() {
        return {
            syncCurrentLocation,
            clearCurrentLocationMarker,
        };
    }

    global.DashboardMapCurrentLocation = {
        createCurrentLocationApi,
        syncCurrentLocation,
        clearCurrentLocationMarker,
    };
}(typeof globalThis !== 'undefined' ? globalThis : window));
