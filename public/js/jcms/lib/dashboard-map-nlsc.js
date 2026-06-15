/** 地圖總覽：國土測繪圖資服務雲 WMTS（正射影像 PHOTO2、地段外圍 LANDSECT） */
(function (global) {
    const NLSC_ATTRIBUTION = '© 內政部國土測繪中心';

    const SOURCE_IDS = Object.freeze({
        orthophoto: 'nlsc-photo2-src',
        landsect: 'nlsc-landsect-src',
    });

    const LAYER_IDS = Object.freeze({
        orthophoto: 'nlsc-photo2',
        landsect: 'nlsc-landsect',
    });

    /** 正射影像開啟時隱藏向量底圖填色，避免遮蓋航空影像 */
    const BASEMAP_COVER_LAYER_IDS = Object.freeze(['landcover', 'landuse']);

    function wmtsTileUrl(layerCode) {
        return `https://wmts.nlsc.gov.tw/wmts/${layerCode}/default/GoogleMapsCompatible/{z}/{y}/{x}`;
    }

    function firstExistingLayerId(map, ids) {
        for (let i = 0; i < ids.length; i += 1) {
            const id = ids[i];
            if (map.getLayer(id)) return id;
        }
        return undefined;
    }

    function ensureNlscLayers(map) {
        if (!map.getSource(SOURCE_IDS.orthophoto)) {
            map.addSource(SOURCE_IDS.orthophoto, {
                type: 'raster',
                tiles: [wmtsTileUrl('PHOTO2')],
                tileSize: 256,
                maxzoom: 19,
                attribution: NLSC_ATTRIBUTION,
            });
        }
        if (!map.getSource(SOURCE_IDS.landsect)) {
            map.addSource(SOURCE_IDS.landsect, {
                type: 'raster',
                tiles: [wmtsTileUrl('LANDSECT')],
                tileSize: 256,
                maxzoom: 18,
                attribution: NLSC_ATTRIBUTION,
            });
        }

        const insertBeforeWater = map.getLayer('water') ? 'water' : undefined;

        if (!map.getLayer(LAYER_IDS.orthophoto)) {
            map.addLayer({
                id: LAYER_IDS.orthophoto,
                type: 'raster',
                source: SOURCE_IDS.orthophoto,
                layout: { visibility: 'none' },
                paint: { 'raster-opacity': 1 },
            }, insertBeforeWater);
        }

        const insertBeforeAdmin = firstExistingLayerId(map, [
            'tw-county-boundaries',
            'tw-town-boundaries',
            LAYER_IDS.orthophoto,
            'water',
        ]);

        if (!map.getLayer(LAYER_IDS.landsect)) {
            map.addLayer({
                id: LAYER_IDS.landsect,
                type: 'raster',
                source: SOURCE_IDS.landsect,
                layout: { visibility: 'none' },
                paint: { 'raster-opacity': 0.92 },
            }, insertBeforeAdmin);
        }
    }

    function applyBasemapCoverVisibility(map, orthophotoOn) {
        BASEMAP_COVER_LAYER_IDS.forEach((layerId) => {
            if (!map.getLayer(layerId)) return;
            map.setLayoutProperty(layerId, 'visibility', orthophotoOn ? 'none' : 'visible');
        });
    }

    function raiseLandsectLayer(map) {
        if (!map.getLayer(LAYER_IDS.landsect)) return;
        const before = firstExistingLayerId(map, ['tw-county-boundaries', 'tw-town-boundaries']);
        if (!before) return;
        try {
            map.moveLayer(LAYER_IDS.landsect, before);
        } catch (err) {
            /* 已在正確堆疊 */
        }
    }

    function applyNlscLayerVisibility(map, state) {
        if (!map) return;
        ensureNlscLayers(map);

        const orthophotoOn = Boolean(state?.nlscOrthophoto);
        const landsectOn = Boolean(state?.nlscLandsect);

        if (map.getLayer(LAYER_IDS.orthophoto)) {
            map.setLayoutProperty(
                LAYER_IDS.orthophoto,
                'visibility',
                orthophotoOn ? 'visible' : 'none'
            );
        }
        if (map.getLayer(LAYER_IDS.landsect)) {
            map.setLayoutProperty(
                LAYER_IDS.landsect,
                'visibility',
                landsectOn ? 'visible' : 'none'
            );
        }

        applyBasemapCoverVisibility(map, orthophotoOn);
        if (landsectOn) raiseLandsectLayer(map);
    }

    function createNlscLayersApi({ getMapLayerState }) {
        return {
            LAYER_IDS,
            ensureNlscLayers(map) {
                ensureNlscLayers(map);
            },
            applyNlscLayerVisibility(map) {
                applyNlscLayerVisibility(map, getMapLayerState());
            },
        };
    }

    global.DashboardMapNlsc = {
        NLSC_ATTRIBUTION,
        LAYER_IDS,
        SOURCE_IDS,
        createNlscLayersApi,
        applyNlscLayerVisibility,
    };
})(typeof globalThis !== 'undefined' ? globalThis : window);
