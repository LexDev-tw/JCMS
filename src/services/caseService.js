const { getDb } = require('../config/database');

const INSERTABLE_KEYS = [
  'id',
  'isPinned',
  'seqTotal',
  'year',
  'word',
  'number',
  'reason',
  'activeParty',
  'passiveParty',
  'dates',
  'closeDate',
  'closeReason',
  'targetAmount',
  'judgmentAmount',
  'note',
  'workspaceId',
  'filingDateRoc7',
  'courtFee',
  'courtFeeDetailJson',
  'proceedingsJson',
  'partiesJson',
];

const UPDATABLE_KEYS = INSERTABLE_KEYS.filter((k) => k !== 'id');

function mapRow(row) {
  if (!row) {
    return null;
  }
  return {
    ...row,
    isPinned: row.isPinned === 1 || row.isPinned === true,
  };
}

function toStoredBoolean(value) {
  if (value === true || value === 1 || value === '1') {
    return 1;
  }
  if (value === false || value === 0 || value === '0') {
    return 0;
  }
  if (value == null) {
    return 0;
  }
  return value ? 1 : 0;
}

function newPartyId() {
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeLegalRep(r) {
  if (!r || typeof r !== 'object') {
    return null;
  }
  return {
    id: String(r.id || newPartyId()),
    name: r.name != null ? String(r.name) : '',
    note: r.note != null ? String(r.note) : '',
  };
}

function normalizeSubAgent(s) {
  if (!s || typeof s !== 'object') {
    return null;
  }
  return {
    id: String(s.id || newPartyId()),
    name: s.name != null ? String(s.name) : '',
  };
}

function normalizeLitigationAgent(a) {
  if (!a || typeof a !== 'object') {
    return null;
  }
  const pt = String(a.proxyType || '').toLowerCase();
  const proxyType = pt === 'special' ? 'special' : 'ordinary';
  const subAgents = Array.isArray(a.subAgents)
    ? a.subAgents.map(normalizeSubAgent).filter(Boolean)
    : [];
  return {
    id: String(a.id || newPartyId()),
    name: a.name != null ? String(a.name) : '',
    mandatePages: a.mandatePages != null ? String(a.mandatePages) : '',
    proxyType,
    subAgents,
  };
}

function normalizeServiceAgent(s) {
  if (!s || typeof s !== 'object') {
    return null;
  }
  return {
    id: String(s.id || newPartyId()),
    name: s.name != null ? String(s.name) : '',
    designatedPages: s.designatedPages != null ? String(s.designatedPages) : '',
  };
}

function normalizeSpecialAgent(s) {
  if (!s || typeof s !== 'object') {
    return null;
  }
  return {
    id: String(s.id || newPartyId()),
    name: s.name != null ? String(s.name) : '',
    pages: s.pages != null ? String(s.pages) : '',
  };
}

function normalizePartyPerson(p) {
  if (!p || typeof p !== 'object') {
    return {
      id: newPartyId(),
      name: '',
      legalReps: [],
      litigationAgents: [],
      serviceAgents: [],
      specialAgents: [],
    };
  }
  return {
    id: String(p.id || newPartyId()),
    name: p.name != null ? String(p.name) : '',
    legalReps: (Array.isArray(p.legalReps) ? p.legalReps : [])
      .map(normalizeLegalRep)
      .filter(Boolean),
    litigationAgents: (Array.isArray(p.litigationAgents) ? p.litigationAgents : [])
      .map(normalizeLitigationAgent)
      .filter(Boolean),
    serviceAgents: (Array.isArray(p.serviceAgents) ? p.serviceAgents : [])
      .map(normalizeServiceAgent)
      .filter(Boolean),
    specialAgents: (Array.isArray(p.specialAgents) ? p.specialAgents : [])
      .map(normalizeSpecialAgent)
      .filter(Boolean),
  };
}

function normalizePartiesJson(value) {
  const empty = JSON.stringify({ v: 1, active: [], passive: [] });
  if (value == null || value === '') {
    return empty;
  }
  try {
    const o = typeof value === 'string' ? JSON.parse(value) : value;
    if (!o || typeof o !== 'object') {
      return empty;
    }
    const active = Array.isArray(o.active) ? o.active.map(normalizePartyPerson).filter(Boolean) : [];
    const passive = Array.isArray(o.passive)
      ? o.passive.map(normalizePartyPerson).filter(Boolean)
      : [];
    return JSON.stringify({ v: 1, active, passive });
  } catch {
    return empty;
  }
}

function normalizeCourtFeeDetailJson(value) {
  if (value == null || value === '') {
    return '{}';
  }
  try {
    const o = typeof value === 'string' ? JSON.parse(value) : value;
    if (!o || typeof o !== 'object') {
      return '{}';
    }
    const d7 = (s) => String(s ?? '').replace(/\D/g, '').slice(0, 7);
    return JSON.stringify({
      claimPages: o.claimPages != null ? String(o.claimPages) : '',
      g1CourtFee: o.g1CourtFee != null ? String(o.g1CourtFee) : '',
      g1CourtFeePages: o.g1CourtFeePages != null ? String(o.g1CourtFeePages) : '',
      g1Paid: o.g1Paid != null ? String(o.g1Paid) : '',
      g1PaidPages: o.g1PaidPages != null ? String(o.g1PaidPages) : '',
      g1PaidFull: !!(o.g1PaidFull),
      g2CourtFee: o.g2CourtFee != null ? String(o.g2CourtFee) : '',
      g2CourtFeePages: o.g2CourtFeePages != null ? String(o.g2CourtFeePages) : '',
      g2Paid: o.g2Paid != null ? String(o.g2Paid) : '',
      g2PaidPages: o.g2PaidPages != null ? String(o.g2PaidPages) : '',
      g2PaidFull: !!(o.g2PaidFull),
      reviewDateRoc7: d7(o.reviewDateRoc7),
    });
  } catch {
    return '{}';
  }
}

function normalizeProceedingsJson(value) {
  if (value == null || value === '') {
    return '[]';
  }
  try {
    const p = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(p)) {
      return '[]';
    }
    const cleaned = p
      .map((row) => {
        if (!row || typeof row !== 'object') {
          return null;
        }
        const d7 =
          row.dateRoc7 != null ? String(row.dateRoc7).replace(/\D/g, '').slice(0, 7) : '';
        if (d7.length !== 7) {
          return null;
        }
        const content = row.content != null ? String(row.content) : '';
        const id =
          row.id != null && String(row.id).trim() !== ''
            ? String(row.id).trim()
            : `pe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        return { id, dateRoc7: d7, content };
      })
      .filter(Boolean);
    return JSON.stringify(cleaned);
  } catch {
    return '[]';
  }
}

function normalizeForWrite(key, value) {
  if (key === 'isPinned') {
    return toStoredBoolean(value);
  }
  if (key === 'proceedingsJson') {
    return normalizeProceedingsJson(value);
  }
  if (key === 'partiesJson') {
    return normalizePartiesJson(value);
  }
  if (key === 'courtFeeDetailJson') {
    return normalizeCourtFeeDetailJson(value);
  }
  return value == null ? null : value;
}

async function getCaseById(id) {
  const sqlite = getDb();
  const row = await sqlite.getAsync('SELECT * FROM cases WHERE id = ?', [id]);
  return mapRow(row);
}

async function getAllCases() {
  const sqlite = getDb();
  const rows = await sqlite.allAsync(
    `SELECT * FROM cases
     ORDER BY "isPinned" DESC,
              COALESCE("seqTotal", 2147483647) ASC,
              id ASC`
  );
  return rows.map(mapRow);
}

async function createCase(caseData) {
  if (!caseData || typeof caseData !== 'object') {
    throw new TypeError('caseData must be an object');
  }
  if (caseData.id == null || String(caseData.id).trim() === '') {
    throw new Error('caseData.id is required');
  }

  const sqlite = getDb();
  const id = String(caseData.id).trim();
  const isPinned = normalizeForWrite('isPinned', caseData.isPinned);

  const values = [
    id,
    isPinned,
    caseData.seqTotal ?? null,
    caseData.year ?? null,
    caseData.word ?? null,
    caseData.number ?? null,
    caseData.reason ?? null,
    caseData.activeParty ?? null,
    caseData.passiveParty ?? null,
    caseData.dates ?? null,
    caseData.closeDate ?? null,
    caseData.closeReason ?? null,
    caseData.targetAmount ?? null,
    caseData.judgmentAmount ?? null,
    caseData.note ?? null,
    caseData.workspaceId != null && String(caseData.workspaceId).trim() !== ''
      ? String(caseData.workspaceId).trim()
      : null,
    caseData.filingDateRoc7 != null && String(caseData.filingDateRoc7).trim() !== ''
      ? String(caseData.filingDateRoc7).replace(/\D/g, '').slice(0, 7)
      : null,
    caseData.courtFee ?? null,
    normalizeCourtFeeDetailJson(caseData.courtFeeDetailJson),
    normalizeProceedingsJson(caseData.proceedingsJson),
    normalizePartiesJson(caseData.partiesJson),
  ];

  const placeholders = values.map(() => '?').join(', ');
  const columns = INSERTABLE_KEYS.map((k) => `"${k}"`).join(', ');

  try {
    await sqlite.runAsync(
      `INSERT INTO cases (${columns}) VALUES (${placeholders})`,
      values
    );
  } catch (err) {
    if (err && err.code === 'SQLITE_CONSTRAINT') {
      const duplicate = new Error(`Case already exists: ${id}`);
      duplicate.code = 'CASE_DUPLICATE';
      throw duplicate;
    }
    throw err;
  }

  return getCaseById(id);
}

async function updateCase(id, caseData) {
  if (id == null || String(id).trim() === '') {
    throw new Error('id is required');
  }
  if (!caseData || typeof caseData !== 'object') {
    throw new TypeError('caseData must be an object');
  }

  const sqlite = getDb();
  const caseId = String(id).trim();

  const sets = [];
  const params = [];

  for (const key of UPDATABLE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(caseData, key)) {
      continue;
    }
    sets.push(`"${key}" = ?`);
    params.push(normalizeForWrite(key, caseData[key]));
  }

  if (sets.length === 0) {
    return getCaseById(caseId);
  }

  params.push(caseId);
  const sql = `UPDATE cases SET ${sets.join(', ')} WHERE id = ?`;
  const { changes } = await sqlite.runAsync(sql, params);

  if (changes === 0) {
    return null;
  }

  return getCaseById(caseId);
}

async function deleteCase(id) {
  if (id == null || String(id).trim() === '') {
    throw new Error('id is required');
  }

  const sqlite = getDb();
  const caseId = String(id).trim();
  const { changes } = await sqlite.runAsync('DELETE FROM cases WHERE id = ?', [
    caseId,
  ]);

  return changes > 0;
}

module.exports = {
  getCaseById,
  getAllCases,
  createCase,
  updateCase,
  deleteCase,
};
