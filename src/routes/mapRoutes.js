const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

const PUBLIC_DATA = path.join(__dirname, '../../public/data');
const URBAN_PLAN_PATH = path.join(PUBLIC_DATA, 'urban-plan.geojson');
const URBAN_PLAN_PARTS = Object.freeze([
    path.join(PUBLIC_DATA, 'taipei-urban-plan.geojson'),
    path.join(PUBLIC_DATA, 'ntpc-urban-plan.geojson'),
]);

function sendUrbanPlanFile(res, filePath) {
    res.set('Content-Type', 'application/geo+json; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=86400');
    return res.sendFile(filePath);
}

router.get('/urban-plan.geojson', (req, res, next) => {
    try {
        if (fs.existsSync(URBAN_PLAN_PATH)) {
            return sendUrbanPlanFile(res, URBAN_PLAN_PATH);
        }

        const parts = URBAN_PLAN_PARTS.filter((filePath) => fs.existsSync(filePath));
        if (!parts.length) {
            return res.status(404).json({ ok: false, error: 'Urban plan GeoJSON not found' });
        }

        const features = [];
        parts.forEach((filePath) => {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (Array.isArray(data?.features)) features.push(...data.features);
        });

        res.set('Content-Type', 'application/geo+json; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=3600');
        return res.json({ type: 'FeatureCollection', features });
    } catch (err) {
        return next(err);
    }
});

module.exports = router;
