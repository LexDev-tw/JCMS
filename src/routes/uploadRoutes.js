const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

/** 依功能分頁建立子資料夾；新增頁面時在此註冊 slug */
const ALLOWED_CATEGORIES = new Set([
    'training',
    'career',
    'dynamics',
    'leave',
    'attendance',
    'overtime',
    'cases',
    'salary',
    'payscale',
    'general',
]);

/** 客戶端以 UTF-8 傳入之原始檔名（FormData 文字欄位），優先於 multer 解出的 originalname */
function pickClientOriginalFileName(req) {
    const v = req.body?.originalFileName ?? req.body?.originalFilename;
    if (v == null) return '';
    const s = String(v).trim();
    return s;
}

/**
 * busboy／multer 常將 multipart 檔名誤解為 latin1；若未帶 originalFileName 則嘗試還原 UTF-8。
 * @param {string} name
 */
function repairMulterFilenameEncoding(name) {
    if (name == null || name === '') return '';
    const str = String(name);
    if (/[\u0080-\uffff]/.test(str)) return str;
    try {
        const repaired = Buffer.from(str, 'latin1').toString('utf8');
        if (repaired && repaired !== str && /[\u0080-\uffff]/.test(repaired)) return repaired;
    } catch (_) {
        /* ignore */
    }
    return str;
}

function resolvedUploadDisplayName(req) {
    const f = req.file;
    if (!f) return '';
    const client = pickClientOriginalFileName(req);
    if (client) return client;
    return repairMulterFilenameEncoding(f.originalname || '') || f.filename;
}

const ALLOWED_EXT = new Set([
    '.pdf',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
    '.gif',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.txt',
    '.zip',
]);

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const storage = multer.diskStorage({
    destination(req, file, cb) {
        const cat = String(req.params.category || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (!ALLOWED_CATEGORIES.has(cat)) {
            cb(new Error('Invalid upload category'));
            return;
        }
        const dir = path.join(UPLOAD_ROOT, cat);
        ensureDir(dir);
        cb(null, dir);
    },
    filename(req, file, cb) {
        let ext = path.extname(file.originalname || '').toLowerCase();
        if (!ALLOWED_EXT.has(ext)) ext = '.bin';
        const base = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        cb(null, base + ext);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
});

const router = express.Router();

function normalizeCategory(param) {
    return String(param || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
}

router.post(
    '/:category',
    (req, res, next) => {
        const cat = normalizeCategory(req.params.category);
        if (!ALLOWED_CATEGORIES.has(cat)) {
            res.status(400).json({ success: false, error: 'Invalid category' });
            return;
        }
        next();
    },
    (req, res, next) => {
        upload.single('file')(req, res, (err) => {
            if (err) {
                if (err instanceof multer.MulterError) {
                    res.status(400).json({ success: false, error: err.message });
                    return;
                }
                res.status(400).json({ success: false, error: err.message || 'Upload failed' });
                return;
            }
            next();
        });
    },
    (req, res) => {
        if (!req.file) {
            res.status(400).json({ success: false, error: 'No file' });
            return;
        }
        const cat = normalizeCategory(req.params.category);
        const rel = `/uploads/${cat}/${req.file.filename}`;
        const fileName = resolvedUploadDisplayName(req);
        res.json({
            success: true,
            url: rel,
            fileName,
            mimeType: req.file.mimetype,
            storedName: req.file.filename,
        });
    }
);

module.exports = router;
module.exports.ALLOWED_CATEGORIES = ALLOWED_CATEGORIES;
