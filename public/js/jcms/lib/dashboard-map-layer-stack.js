/** 地圖總覽：圖層堆疊（正射影像作底圖，其餘圖層疊在上層） */
(function (global) {
    const NLSC_ORTHO = 'nlsc-photo2';
    const NLSC_LANDSECT = 'nlsc-landsect';

    const VECTOR_BASEMAP_FILL_IDS = Object.freeze(['water', 'landcover', 'landuse']);
    const TW_BOUNDARY_LAYER_IDS = Object.freeze(['tw-county-boundaries', 'tw-town-boundaries']);

    function firstExistingLayerId(map, ids) {
        for (let i = 0; i < ids.length; i += 1) {
            const id = ids[i];
            if (map.getLayer(id)) return id;
        }
        return undefined;
    }

    function safeMoveBefore(map, layerId, beforeId) {
        if (!layerId || !beforeId || !map.getLayer(layerId) || !map.getLayer(beforeId)) return;
        try {
            map.moveLayer(layerId, beforeId);
        } catch (_) {
            /* 已在目標位置 */
        }
    }

    function safeMoveToTop(map, layerId) {
        if (!layerId || !map.getLayer(layerId)) return;
        try {
            map.moveLayer(layerId);
        } catch (_) {
            /* ignore */
        }
    }

    /**
     * 正射影像固定於底圖（background 之上），其餘圖層依序疊在上方。
     * 開啟正射時保留橘色縣市（實線）／鄉鎮（虛線）界線。
     */
    function reconcileDashboardLayerStack(map, state, layerIds = {}) {
        if (!map?.getStyle()) return;

        const orthoOn = Boolean(state?.nlscOrthophoto);
        const countyId = layerIds.countyBoundaries || TW_BOUNDARY_LAYER_IDS[0];
        const townId = layerIds.townBoundaries || TW_BOUNDARY_LAYER_IDS[1];
        const adminLabelsId = layerIds.adminLabels || 'tw-town-labels';

        VECTOR_BASEMAP_FILL_IDS.forEach((layerId) => {
            if (!map.getLayer(layerId)) return;
            map.setLayoutProperty(layerId, 'visibility', orthoOn ? 'none' : 'visible');
        });

        if (orthoOn && map.getLayer(NLSC_ORTHO)) {
            const anchor = firstExistingLayerId(map, [
                'water',
                'landcover',
                'landuse',
                'road-detail-minor',
                'transp-major-roads',
            ]);
            if (anchor) {
                safeMoveBefore(map, NLSC_ORTHO, anchor);
            }
        }

        const raiseBottomToTop = [
            NLSC_LANDSECT,
            'transp-major-roads',
            'transp-rail',
            'transp-transit',
            'transp-ferry',
            'aeroway-airport-fill',
            'aeroway-airport-line',
            'poi-harbor',
            'road-detail-minor',
            'cwa-satellite-cloud',
            'cwa-radar-echo',
            'cwa-rain-advisory-fill',
            countyId,
            townId,
            layerIds.rainAdvisoryLabel || 'cwa-rainfall-label',
            adminLabelsId,
            'tw-town-population-labels',
            'epa-aq-station-circle',
            'epa-aq-station-label',
            'police-agency-circle',
            'judicial-agency-circle',
            'judicial-jurisdiction-fill',
            'judicial-jurisdiction-line',
        ];

        raiseBottomToTop.forEach((layerId) => safeMoveToTop(map, layerId));

        if (orthoOn) {
            TW_BOUNDARY_LAYER_IDS.forEach((layerId) => {
                if (!map.getLayer(layerId)) return;
                map.setLayoutProperty(layerId, 'visibility', 'visible');
            });
        }
    }

    global.DashboardMapLayerStack = {
        NLSC_ORTHO,
        NLSC_LANDSECT,
        reconcileDashboardLayerStack,
    };
}(typeof globalThis !== 'undefined' ? globalThis : window));
