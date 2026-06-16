/** 司法／警察圖層：使用者覆寫資料（localStorage） */

export const AGENCY_LAYER_KINDS = Object.freeze({
    judicial: 'judicial',
    police: 'police',
});

const BASE_GEOJSON_URL = Object.freeze({
    judicial: 'data/judicial-agencies.geojson',
    police: 'data/police-agencies.geojson',
});

export function agencyLayerStorageKey(workspaceId) {
    const ws = String(workspaceId || 'default').trim() || 'default';
    return `jcms.agency-layers.${ws}`;
}

export function createAgencyFeatureId(prefix = 'ag') {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyAgencyLayerDoc() {
    return {
        version: 1,
        judicial: null,
        police: null,
    };
}

function stableFeatureKey(props, coords) {
    const name = String(props?.name || '').trim();
    const lng = Number(coords?.[0]);
    const lat = Number(coords?.[1]);
    if (!name || !Number.isFinite(lng) || !Number.isFinite(lat)) {
        return createAgencyFeatureId('base');
    }
    return `base-${name}-${lng.toFixed(5)}-${lat.toFixed(5)}`;
}

function normalizeJudicialFeature(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const coords = raw.coordinates || raw.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const props = raw.properties || raw;
    const name = String(props.name || raw.name || '').trim() || '未命名機關';
    const type = String(props.type || raw.type || '法院').trim();
    const jurisdiction = String(props.jurisdiction || raw.jurisdiction || '').trim();
    const id = String(raw.id || props.id || '').trim()
        || stableFeatureKey({ name }, [lng, lat]);
    return { id, name, type, jurisdiction, coordinates: [lng, lat] };
}

function normalizePoliceFeature(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const coords = raw.coordinates || raw.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const lng = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    const props = raw.properties || raw;
    const name = String(props.name || raw.name || '').trim() || '未命名單位';
    const unit = String(props.unit || raw.unit || '').trim();
    const address = String(props.address || raw.address || '').trim();
    const phone = String(props.phone || raw.phone || '').trim();
    const zip = String(props.zip || raw.zip || '').trim();
    const id = String(raw.id || props.id || '').trim()
        || stableFeatureKey({ name }, [lng, lat]);
    return { id, name, unit, address, phone, zip, coordinates: [lng, lat] };
}

function normalizeAgencyLayer(kind, raw) {
    if (!raw || typeof raw !== 'object') return null;
    const features = [];
    (raw.features || []).forEach((item) => {
        const norm = kind === AGENCY_LAYER_KINDS.judicial
            ? normalizeJudicialFeature(item)
            : normalizePoliceFeature(item);
        if (norm) features.push(norm);
    });
    return { features };
}

export function normalizeAgencyLayerDoc(raw) {
    if (!raw || typeof raw !== 'object') return createEmptyAgencyLayerDoc();
    return {
        version: 1,
        judicial: raw.judicial ? normalizeAgencyLayer(AGENCY_LAYER_KINDS.judicial, raw.judicial) : null,
        police: raw.police ? normalizeAgencyLayer(AGENCY_LAYER_KINDS.police, raw.police) : null,
    };
}

export function loadAgencyLayerDoc(workspaceId) {
    try {
        const raw = localStorage.getItem(agencyLayerStorageKey(workspaceId));
        if (!raw) return createEmptyAgencyLayerDoc();
        return normalizeAgencyLayerDoc(JSON.parse(raw));
    } catch (err) {
        console.warn('[agency-layer] 讀取失敗', err);
        return createEmptyAgencyLayerDoc();
    }
}

export function saveAgencyLayerDoc(workspaceId, doc) {
    try {
        localStorage.setItem(
            agencyLayerStorageKey(workspaceId),
            JSON.stringify(normalizeAgencyLayerDoc(doc))
        );
        return true;
    } catch (err) {
        console.warn('[agency-layer] 儲存失敗', err);
        return false;
    }
}

export function getAgencyBaseGeoJsonUrl(kind) {
    return BASE_GEOJSON_URL[kind] || BASE_GEOJSON_URL.judicial;
}

function geoJsonFeatureToJudicial(feature) {
    return normalizeJudicialFeature({
        id: feature.properties?.id,
        ...feature.properties,
        coordinates: feature.geometry?.coordinates,
    });
}

function geoJsonFeatureToPolice(feature) {
    return normalizePoliceFeature({
        id: feature.properties?.id,
        ...feature.properties,
        coordinates: feature.geometry?.coordinates,
    });
}

export async function loadBaseAgencyFeatures(kind) {
    const url = getAgencyBaseGeoJsonUrl(kind);
    const res = await fetch(url, { headers: { Accept: 'application/geo+json, application/json' } });
    if (!res.ok) throw new Error(`${url} HTTP ${res.status}`);
    const data = await res.json();
    const mapper = kind === AGENCY_LAYER_KINDS.judicial
        ? geoJsonFeatureToJudicial
        : geoJsonFeatureToPolice;
    return (data.features || []).map(mapper).filter(Boolean);
}

export async function resolveAgencyFeatures(kind, doc) {
    const layer = doc?.[kind];
    if (layer?.features?.length) return layer.features;
    return loadBaseAgencyFeatures(kind);
}

export function judicialFeaturesToGeoJson(features) {
    return {
        type: 'FeatureCollection',
        features: (features || []).map((f) => ({
            type: 'Feature',
            properties: {
                id: f.id,
                name: f.name,
                type: f.type,
                jurisdiction: f.jurisdiction || '',
            },
            geometry: { type: 'Point', coordinates: f.coordinates },
        })),
    };
}

export function policeFeaturesToGeoJson(features) {
    return {
        type: 'FeatureCollection',
        features: (features || []).map((f) => ({
            type: 'Feature',
            properties: {
                id: f.id,
                name: f.name,
                unit: f.unit || '',
                address: f.address || '',
                phone: f.phone || '',
                zip: f.zip || '',
            },
            geometry: { type: 'Point', coordinates: f.coordinates },
        })),
    };
}

export function agencyFeaturesToGeoJson(kind, features) {
    if (kind === AGENCY_LAYER_KINDS.judicial) {
        return judicialFeaturesToGeoJson(features);
    }
    return policeFeaturesToGeoJson(features);
}

export async function ensureAgencyLayerInitialized(kind, doc) {
    if (doc[kind]?.features?.length) return doc[kind].features;
    const base = await loadBaseAgencyFeatures(kind);
    doc[kind] = { features: base };
    return base;
}

export function createDefaultJudicialFeature(coords, index) {
    return {
        id: createAgencyFeatureId('jud'),
        name: `機關 ${index + 1}`,
        type: '法院',
        jurisdiction: '',
        coordinates: coords,
    };
}

export function createDefaultPoliceFeature(coords, index) {
    return {
        id: createAgencyFeatureId('pol'),
        name: `單位 ${index + 1}`,
        unit: '',
        address: '',
        phone: '',
        zip: '',
        coordinates: coords,
    };
}
