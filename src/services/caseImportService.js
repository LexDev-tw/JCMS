const XLSX = require('xlsx');
const caseService = require('./caseService');

function normalizeCaseNo(raw) {
  return String(raw == null ? '' : raw)
    .trim()
    .replace(/\s+/g, '')
    .replace(/[－–—]/g, '-');
}

function parseCaseNo(raw) {
  const src = normalizeCaseNo(raw);
  const m = src.match(/^(\d+)([^\d]+)(\d+)$/);
  if (!m) {
    return { year: '', word: '', number: '', ok: false };
  }
  const normalizedWord = m[2]
    .replace(/\s+/g, '')
    .replace(/年/g, '')
    .replace(/字/g, '');
  const normalizedNumber = String(parseInt(m[3], 10) || 0);
  return {
    year: m[1],
    word: normalizedWord,
    number: normalizedNumber,
    ok: true,
  };
}

function excelDateSerialToIso(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return '';
  const utcDays = Math.floor(n - 25569);
  const utcValue = utcDays * 86400;
  const date = new Date(utcValue * 1000);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toRocDate7(value) {
  const v = String(value == null ? '' : value).trim();
  if (!v) return '';
  const digits = v.replace(/\D/g, '');
  if (/^\d{7}$/.test(digits)) {
    return digits;
  }
  if (/^\d{8}$/.test(digits)) {
    const y = Number(digits.slice(0, 4)) - 1911;
    if (y > 0) return `${String(y).padStart(3, '0')}${digits.slice(4)}`;
  }
  const m = v.match(/^(\d{3,4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (m) {
    const yRaw = Number(m[1]);
    const mm = String(Number(m[2])).padStart(2, '0');
    const dd = String(Number(m[3])).padStart(2, '0');
    const y = yRaw > 1911 ? yRaw - 1911 : yRaw;
    if (y >= 1 && y <= 999) {
      return `${String(y).padStart(3, '0')}${mm}${dd}`;
    }
  }
  const fromDate = new Date(v);
  if (!Number.isNaN(fromDate.getTime())) {
    const y = fromDate.getFullYear() - 1911;
    const mm = String(fromDate.getMonth() + 1).padStart(2, '0');
    const dd = String(fromDate.getDate()).padStart(2, '0');
    if (y >= 1 && y <= 999) {
      return `${String(y).padStart(3, '0')}${mm}${dd}`;
    }
  }
  return '';
}

function normalizeDateInput(v) {
  if (v == null || String(v).trim() === '') return '';
  if (typeof v === 'number') {
    const iso = excelDateSerialToIso(v);
    return toRocDate7(iso);
  }
  return toRocDate7(v);
}

function valueOf(row, key) {
  if (!row || typeof row !== 'object') return '';
  return row[key] == null ? '' : String(row[key]).trim();
}

function mapImportRow(row, rowIndex, workspaceId, seqTotal) {
  const rawCaseNo = valueOf(row, '案號');
  const reason = valueOf(row, '案由');
  const rocDate = normalizeDateInput(row['收案日期']);
  const passiveParty = valueOf(row, '對造姓名');
  const activeParty = valueOf(row, '當事人');
  const parsed = parseCaseNo(rawCaseNo);
  const warnings = [];
  const errors = [];

  if (!rawCaseNo) errors.push('案號為空');
  if (!reason) errors.push('案由為空');
  if (!rocDate) errors.push('收案日期格式無法解析');
  if (rawCaseNo && !parsed.ok) warnings.push('案號無法拆解，已改用 fallback');

  const fallbackWord = '待確認';
  const fallbackNumber = String(rowIndex + 1).padStart(5, '0');
  const id = `${Date.now()}_${rowIndex}_${Math.random().toString(36).slice(2, 8)}`;

  return {
    rowNo: rowIndex + 2,
    source: {
      caseNo: rawCaseNo,
      reason,
      receiveDate: valueOf(row, '收案日期'),
      passiveParty,
      activeParty,
    },
    payload: {
      id,
      isPinned: false,
      seqTotal,
      workspaceId,
      year: parsed.ok ? parsed.year : '',
      word: parsed.ok ? parsed.word : fallbackWord,
      number: parsed.ok ? parsed.number : fallbackNumber,
      reason,
      activeParty,
      passiveParty,
      dates: rocDate,
      closeDate: '',
      closeReason: '',
      targetAmount: '',
      judgmentAmount: '',
      note: rawCaseNo && !parsed.ok ? `原始案號：${rawCaseNo}` : '',
      filingDateRoc7: rocDate || '',
      courtFee: '',
      courtFeeDetailJson: '{}',
      proceedingsJson: '[]',
    },
    warnings,
    errors,
  };
}

function parseWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames && workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel 無可用工作表');
  }
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

async function importCasesFromExcelBuffer(buffer, options = {}) {
  const dryRun = options.dryRun !== false;
  const workspaceId = String(options.workspaceId || 'WS_001');
  const rows = parseWorkbook(buffer);
  const currentCases = await caseService.getAllCases();
  const currentSeq = currentCases
    .filter((c) => String(c.workspaceId || 'WS_001') === workspaceId)
    .reduce((max, c) => Math.max(max, parseInt(String(c.seqTotal || 0), 10) || 0), 0);

  const mapped = rows.map((row, idx) => mapImportRow(row, idx, workspaceId, currentSeq + idx + 1));
  const requiredFields = ['案號', '案由', '收案日期'];
  const first = rows[0] || {};
  const missingHeaders = requiredFields.filter((k) => !(k in first));
  if (missingHeaders.length > 0) {
    const err = new Error(`缺少必要欄位：${missingHeaders.join(', ')}`);
    err.code = 'IMPORT_HEADERS_MISSING';
    throw err;
  }

  const failures = [];
  const warnings = [];
  const successRows = [];

  for (const item of mapped) {
    if (item.errors.length > 0) {
      failures.push({ rowNo: item.rowNo, errors: item.errors });
      continue;
    }
    if (item.warnings.length > 0) {
      warnings.push({ rowNo: item.rowNo, warnings: item.warnings });
    }
    successRows.push(item);
  }

  const summary = {
    total: mapped.length,
    success: successRows.length,
    failed: failures.length,
    warnings: warnings.length,
    failures,
    warningsDetail: warnings,
    preview: successRows.slice(0, 20).map((x) => ({
      rowNo: x.rowNo,
      payload: x.payload,
      source: x.source,
    })),
  };

  if (dryRun) {
    return { ...summary, committed: 0, mode: 'preview' };
  }

  let committed = 0;
  const commitErrors = [];
  for (const row of successRows) {
    try {
      await caseService.createCase(row.payload);
      committed += 1;
    } catch (e) {
      commitErrors.push({
        rowNo: row.rowNo,
        errors: [e.message || '建立失敗'],
      });
    }
  }

  return {
    ...summary,
    committed,
    failed: failures.length + commitErrors.length,
    failures: [...failures, ...commitErrors],
    mode: 'commit',
  };
}

module.exports = {
  importCasesFromExcelBuffer,
  parseCaseNo,
  toRocDate7,
};
