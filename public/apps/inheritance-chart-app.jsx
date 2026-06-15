/**
 * 繼承系統表製作工具 — JCMS Neo-Swiss
 * 依賴：先載入 genealogyLayout.js、inheritanceCompute.js（見 JCMS.html）。
 * 法定繼承：inheritanceCompute.js；版面：genealogyLayout.js。
 */
(function () {
  const { useCallback, useEffect, useMemo, useRef, useState } = React;

  const GL = typeof window !== 'undefined' && window.JCMSGenealogyLayout;
  const IC = typeof window !== 'undefined' && window.JCMSInheritanceCompute;
  if (!GL || !IC) {
    throw new Error('繼承系統表：請先於 inheritance-chart-app.jsx 之前載入 genealogyLayout.js 與 inheritanceCompute.js');
  }

  const GEN_NODE_W = GL.GEN_NODE_W;
  const GEN_NODE_H = GL.GEN_NODE_H;

  const parseRocInput = IC.parseRocInput.bind(IC);
  const rocToDate = IC.rocToDate.bind(IC);

  function getChildren(parentId, parentEdges) {
    return GL._internals.getChildren(parentId, parentEdges);
  }
  function getParents(childId, parentEdges) {
    return GL._internals.getParents(childId, parentEdges);
  }

  function computeInheritance(model) {
    return IC.computeInheritance(model);
  }

  const SCHEMA_VERSION = 2;
  const TOKENS = Object.freeze({
    input: 'swiss-input rounded-sm min-w-0 font-sans text-ink-900 placeholder:text-ink-600',
    inputMono: 'swiss-input rounded-sm min-w-0 font-mono tabular-nums text-ink-900 placeholder:text-ink-600',
    select: 'swiss-select rounded-sm w-full min-w-0 font-sans font-bold text-ink-900',
    btn: {
      base: 'swiss-btn',
      primary: 'swiss-btn--primary',
      danger: 'swiss-btn--danger',
      sub: 'swiss-btn--secondary',
      ghost: 'swiss-btn--ghost',
    },
  });

  /** 出生／死亡欄：允許開頭 `-`，後接至多 7 位數字（民國前為 `-`+YYYMMDD） */
  function sanitizeRocDateFieldInput(raw) {
    const s = String(raw || '');
    const neg = s.startsWith('-');
    const digits = s.replace(/\D/g, '').slice(0, 8);
    if (neg) return digits.length ? `-${digits.slice(0, 7)}` : '-';
    return digits.slice(0, 8);
  }

  function adToRocStorageString(adYear, month, day) {
    const mStr = String(month).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    if (adYear < 1912) {
      const n = 1912 - adYear;
      return `-${String(n).padStart(3, '0')}${mStr}${dStr}`;
    }
    const roc = adYear - 1911;
    return `${roc}${mStr}${dStr}`;
  }

  function newPersonId() {
    return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  /** @param {'married'|'divorced'} [bond] 離婚可附離婚日期（與人物日期同為 ROC 連續數字字串） */
  function normalizeSpousePair(aId, bId, bond, divorceDate) {
    const b = bond === 'divorced' ? 'divorced' : 'married';
    const base = aId < bId ? { aId, bId, bond: b } : { aId: bId, bId: aId, bond: b };
    if (b === 'divorced' && divorceDate != null && String(divorceDate).trim()) {
      base.divorceDate = String(divorceDate).trim();
    }
    return base;
  }

  function spouseBond(sp) {
    return sp && sp.bond === 'divorced' ? 'divorced' : 'married';
  }

  /** 親子邊：kind=adoptive（養親）、adoptionTerminated（終止後不計入繼承親屬） */
  function normalizeParentEdge(raw) {
    if (!raw || !raw.parentId || !raw.childId) return null;
    const e = { parentId: raw.parentId, childId: raw.childId };
    if (raw.kind === 'adoptive') e.kind = 'adoptive';
    if (raw.adoptionTerminated) e.adoptionTerminated = true;
    return e;
  }

  function validateBatchInheritancePayload(data) {
    const errs = [];
    if (!data || typeof data !== 'object') {
      errs.push('根物件無效');
      return { ok: false, errs };
    }
    if (!data.persons || typeof data.persons !== 'object' || Array.isArray(data.persons)) {
      errs.push('persons 必須為物件');
    }
    if (!Array.isArray(data.parentEdges)) errs.push('parentEdges 必須為陣列');
    if (!Array.isArray(data.spousePairs)) errs.push('spousePairs 必須為陣列');
    if (errs.length) return { ok: false, errs };
    return { ok: true, errs: [] };
  }

  function serializeModel(model) {
    return JSON.stringify(
      {
        schema_version: SCHEMA_VERSION,
        decedentId: model.decedentId,
        persons: model.persons,
        parentEdges: model.parentEdges,
        spousePairs: model.spousePairs,
        nodePositions: model.nodePositions || {},
      },
      null,
      2
    );
  }

  function parseLoadedMd(text) {
    const jsonFence = text.match(/```json\s*([\s\S]*?)```/i);
    if (jsonFence) {
      try {
        const data = JSON.parse(jsonFence[1].trim());
        if (
          data.persons &&
          typeof data.persons === 'object' &&
          !Array.isArray(data.persons) &&
          Array.isArray(data.parentEdges) &&
          Array.isArray(data.spousePairs)
        ) {
          const seenPair = new Set();
          const spousePairs = [];
          for (const s of data.spousePairs || []) {
            if (!s || !s.aId || !s.bId) continue;
            const n = normalizeSpousePair(s.aId, s.bId, s.bond, s.divorceDate);
            const k = `${n.aId}\0${n.bId}`;
            if (seenPair.has(k)) continue;
            seenPair.add(k);
            spousePairs.push(n);
          }
          const pe = (data.parentEdges || [])
            .map(normalizeParentEdge)
            .filter(Boolean);
          return {
            decedentId: data.decedentId || null,
            persons: data.persons,
            parentEdges: pe,
            spousePairs,
            nodePositions: data.nodePositions && typeof data.nodePositions === 'object' ? data.nodePositions : {},
          };
        }
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function buildMdFile(model) {
    const iso = new Date().toISOString();
    const body = serializeModel(model);
    return [
      '---',
      `schema_version: ${SCHEMA_VERSION}`,
      'tool: inheritance-chart',
      `decedent_id: ${model.decedentId || ''}`,
      `updated_at: "${iso}"`,
      '---',
      '',
      '## 繼承親系圖資料',
      '',
      '以下 JSON 供程式載入；手動編輯請慎防格式錯誤。',
      '',
      '```json',
      body,
      '```',
      '',
    ].join('\n');
  }

  function DateField({ value, onChange, disabled }) {
    return (
      <div className={`swiss-control-shell flex min-w-0 items-stretch overflow-hidden rounded-sm border border-ink-100 ${disabled ? 'bg-panel' : 'bg-surface'}`}>
        <input
          className={`${TOKENS.inputMono} !h-full flex-1 !border-0 !rounded-none !px-1.5 text-center text-[11px] tracking-wide`}
          value={value || ''}
          disabled={disabled}
          maxLength={9}
          onChange={(e) => onChange(sanitizeRocDateFieldInput(e.target.value))}
        />
        <div className="flex shrink-0 items-stretch border-l border-ink-100/80 bg-surface">
          {value ? (
            <button
              type="button"
              tabIndex={-1}
              disabled={disabled}
              onClick={() => onChange('')}
              className="inline-flex w-7 items-center justify-center text-ink-400 transition-colors hover:text-accent disabled:opacity-40"
              title="清除"
            >
              <i className="ph ph-x text-[11px]" aria-hidden />
            </button>
          ) : null}
          <label className="relative inline-flex w-7 cursor-pointer items-center justify-center text-ink-400 transition-colors hover:text-accent">
            <i className="ph ph-calendar-dots text-[11px]" />
            <input
              type="date"
              tabIndex={-1}
              disabled={disabled}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={(e) => {
                if (!e.target.value) return;
                const [y, m, d] = e.target.value.split('-').map((x) => parseInt(x, 10));
                onChange(adToRocStorageString(y, m, d));
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
    );
  }

  /** 決定子女在樹狀清單中掛在哪位雙親之下（雙親時取排序後第一位，單一雙親即該人）。 */
  function treeParentForChild(childId, parentEdges, persons) {
    const ps = getParents(childId, parentEdges).filter((p) => persons[p]).slice().sort();
    return ps.length ? ps[0] : null;
  }

  function childrenInTreeOrder(parentId, parentEdges, persons) {
    return getChildren(parentId, parentEdges)
      .filter((cid) => persons[cid] && treeParentForChild(cid, parentEdges, persons) === parentId)
      .slice()
      .sort((a, b) => {
        const ka = birthOrderSortKey(persons[a]);
        const kb = birthOrderSortKey(persons[b]);
        if (ka !== kb) return ka.localeCompare(kb, 'zh-Hant', { numeric: true });
        return (persons[a].name || '').localeCompare(persons[b].name || '', 'zh-Hant');
      });
  }

  function spousePartnerIds(personId, spousePairs, persons) {
    const out = [];
    spousePairs.forEach((sp) => {
      if (!persons[sp.aId] || !persons[sp.bId]) return;
      if (sp.aId === personId) out.push(sp.bId);
      else if (sp.bId === personId) out.push(sp.aId);
    });
    return [...new Set(out)].slice().sort();
  }

  function genealogyRoots(persons, parentEdges) {
    return Object.keys(persons)
      .filter((id) => !getParents(id, parentEdges).filter((p) => persons[p]).length)
      .slice()
      .sort((a, b) => (persons[a].name || '').localeCompare(persons[b].name || '', 'zh-Hant'));
  }

  /** 左欄：親系樹狀清單（預設展開，可收合子項） */
  function PersonTreeList({
    persons,
    parentEdges,
    spousePairs,
    selectedIds,
    onSelect,
    decedentId,
    result,
    onSetDecedent,
    personIdSetKey,
  }) {
    const [collapsedIds, setCollapsedIds] = useState(() => new Set());
    const prevPersonIdsKeyRef = useRef('');

    useEffect(() => {
      const key = personIdSetKey || '';
      const prev = prevPersonIdsKeyRef.current;
      prevPersonIdsKeyRef.current = key;
      const prevIds = prev ? new Set(prev.split('|').filter(Boolean)) : new Set();
      const newIds = key.split('|').filter((id) => id && !prevIds.has(id));
      if (!newIds.length) return;
      setCollapsedIds((s) => {
        const n = new Set(s);
        newIds.forEach((id) => n.delete(id));
        return n;
      });
    }, [personIdSetKey]);

    const toggleCollapse = useCallback((id, e) => {
      e.stopPropagation();
      setCollapsedIds((prev) => {
        const n = new Set(prev);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      });
    }, []);

    const roots = useMemo(
      () => genealogyRoots(persons, parentEdges),
      [persons, parentEdges]
    );

    const treeBody = useMemo(() => {
      const spouseFlatRow = new Set();
      const visitedPerson = new Set();
      const blocks = [];

      function hasExpandable(id) {
        const kids = childrenInTreeOrder(id, parentEdges, persons);
        const partners = spousePartnerIds(id, spousePairs, persons).filter((pid) => persons[pid]);
        const flatSpouses = partners.filter((pid) => childrenInTreeOrder(pid, parentEdges, persons).length === 0);
        return kids.length > 0 || flatSpouses.length > 0;
      }

      function renderSubtree(rootId, depth) {
        const p = persons[rootId];
        if (!p || visitedPerson.has(rootId)) return;
        visitedPerson.add(rootId);
        blocks.push({ kind: 'person', id: rootId, depth, expandable: hasExpandable(rootId) });

        if (collapsedIds.has(rootId)) return;

        spousePartnerIds(rootId, spousePairs, persons)
          .filter((x) => persons[x])
          .forEach((sid) => {
            if (childrenInTreeOrder(sid, parentEdges, persons).length > 0) return;
            spouseFlatRow.add(sid);
            blocks.push({ kind: 'spouse', id: sid, anchorId: rootId, depth: depth + 1 });
          });

        childrenInTreeOrder(rootId, parentEdges, persons).forEach((cid) => {
          renderSubtree(cid, depth + 1);
        });
      }

      roots.forEach((rid) => {
        if (spouseFlatRow.has(rid)) return;
        renderSubtree(rid, 0);
      });

      Object.keys(persons).forEach((id) => {
        if (!visitedPerson.has(id)) renderSubtree(id, 0);
      });

      return blocks;
    }, [persons, parentEdges, spousePairs, roots, collapsedIds]);

    return (
      <div className="flex flex-col gap-0.5">
        {treeBody.map((block, idx) => {
          if (block.kind === 'spouse') {
            const p = persons[block.id];
            if (!p) return null;
            const pad = 10 + block.depth * 12;
            const sel = selectedIds.includes(p.id);
            const isDecTree = p.id === decedentId;
            const r = result?.byId?.[p.id];
            const isDead = !!(p.deathDate && String(p.deathDate).trim());
            const isHeir = r && (r.status === 'heir' || r.status === 'spouse_heir');
            return (
              <div
                key={`sp-${block.anchorId}-${p.id}-${idx}`}
                role="button"
                tabIndex={0}
                style={{ paddingLeft: pad }}
                onClick={(e) => onSelect(p.id, e)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(p.id, e);
                  }
                }}
                className={`w-full text-left rounded-sm border px-2 py-1 transition-colors cursor-pointer ${
                  isDecTree
                    ? 'border-2 border-ink-900 bg-panel ring-1 ring-ink-900/25 shadow-subtle'
                    : sel
                      ? 'border-ink-900 bg-panel'
                      : 'border-ink-100 bg-surface hover:bg-ink-100/15'
                }`}
              >
                <div className="flex items-center gap-1 min-w-0">
                  <span className="inline-block w-5 shrink-0" aria-hidden />
                  <span className="text-[9px] font-bold uppercase tracking-widest text-ink-400 shrink-0">配偶</span>
                  <span className={`truncate min-w-0 font-bold text-ink-900 ${isDecTree ? 'text-[12px]' : 'text-[11px]'}`}>
                    {p.name || '（未命名）'}
                  </span>
                  {isDecTree ? (
                    <span className="shrink-0 rounded-sm bg-ink-900 px-1 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-white shadow-subtle">
                      被繼承人
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 text-[10px] font-mono tabular-nums text-ink-600">
                  {p.birthOrder ? <span>{p.birthOrder}</span> : null}
                  {isDead ? <span className="text-ink-400">亡</span> : <span>生存</span>}
                </div>
                {r && p.id !== decedentId ? (
                  <div
                    className={`mt-1 pl-6 text-[10px] font-bold uppercase tracking-wider ${
                      isHeir ? 'text-accent' : r.status === 'predeceased' ? 'text-ink-600' : 'text-ink-400'
                    }`}
                  >
                    {r.note || r.status}
                  </div>
                ) : null}
                {p.id !== decedentId ? (
                  <button
                    type="button"
                    className="mt-1 pl-6 text-[9px] font-bold text-ink-400 hover:text-ink-900"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetDecedent(p.id);
                    }}
                  >
                    設為被繼承人
                  </button>
                ) : null}
              </div>
            );
          }

          const p = persons[block.id];
          if (!p) return null;
          const pad = 10 + block.depth * 12;
          const sel = selectedIds.includes(p.id);
          const isDecTree = p.id === decedentId;
          const r = result?.byId?.[p.id];
          const isDead = !!(p.deathDate && String(p.deathDate).trim());
          const isHeir = r && (r.status === 'heir' || r.status === 'spouse_heir');

          return (
            <div
              key={`p-${p.id}-${idx}`}
              role="button"
              tabIndex={0}
              style={{ paddingLeft: pad }}
              onClick={(e) => onSelect(p.id, e)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(p.id, e);
                }
              }}
              className={`w-full text-left rounded-sm border px-2 py-1 transition-colors cursor-pointer ${
                isDecTree
                  ? 'border-2 border-ink-900 bg-panel ring-1 ring-ink-900/25 shadow-subtle'
                  : sel
                    ? 'border-ink-900 bg-panel'
                    : 'border-ink-100 bg-surface hover:bg-ink-100/15'
              }`}
            >
              <div className="flex items-center gap-1 min-w-0">
                {block.expandable ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-ink-600 hover:text-ink-900"
                    aria-expanded={!collapsedIds.has(p.id)}
                    aria-label={collapsedIds.has(p.id) ? '展開' : '收合'}
                    onClick={(e) => toggleCollapse(p.id, e)}
                  >
                    <i
                      className={`ph ph-caret-right text-xs transition-transform ${collapsedIds.has(p.id) ? '' : 'rotate-90'}`}
                      aria-hidden
                    />
                  </button>
                ) : (
                  <span className="inline-block w-5 shrink-0" aria-hidden />
                )}
                <span className={`truncate min-w-0 font-bold text-ink-900 ${isDecTree ? 'text-[12px]' : 'text-[11px]'}`}>
                  {p.name || '（未命名）'}
                </span>
                {isDecTree ? (
                  <span className="shrink-0 rounded-sm bg-ink-900 px-1 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-white shadow-subtle">
                    被繼承人
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 pl-6 text-[10px] font-mono tabular-nums text-ink-600">
                {p.birthOrder ? <span>{p.birthOrder}</span> : null}
                {isDead ? <span className="text-ink-400">亡</span> : <span>生存</span>}
              </div>
              {r && p.id !== decedentId ? (
                <div
                  className={`mt-1 pl-6 text-[10px] font-bold uppercase tracking-wider ${
                    isHeir ? 'text-accent' : r.status === 'predeceased' ? 'text-ink-600' : 'text-ink-400'
                  }`}
                >
                  {r.note || r.status}
                </div>
              ) : null}
              {p.id !== decedentId ? (
                <button
                  type="button"
                  className="mt-1 pl-6 text-[9px] font-bold text-ink-400 hover:text-ink-900"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetDecedent(p.id);
                  }}
                >
                  設為被繼承人
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  function formatRocDateDisplay(s) {
    const t = String(s || '').trim();
    return t || '—';
  }

  function birthOrderSortKey(p) {
    const raw = String(p.birthOrder || '').trim();
    if (!raw) return '';
    const n = Number(raw);
    if (Number.isFinite(n) && String(n) === raw) return String(1e6 + n).padStart(12, '0');
    return raw;
  }

  /** 配偶連線是否存在（結婚或離婚皆視為家系圖上之一對） */
  function hasSpouseEdgeBetween(aId, bId, spousePairs) {
    const n = normalizeSpousePair(aId, bId, 'married');
    return spousePairs.some((sp) => sp.aId === n.aId && sp.bId === n.bId);
  }

  function rectsIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function layoutGenealogyPositions(persons, parentEdges, spousePairs) {
    return GL.layoutGenealogyPositions(persons, parentEdges, spousePairs);
  }

  function mergeLayoutKeepingPins(prevPositions, laidPositions, pinnedIds) {
    return GL.mergeLayoutKeepingPins(prevPositions, laidPositions, pinnedIds);
  }

  /** 雙擊畫布人物：基本資料小視窗 */
  function PersonCanvasEditModal({
    person,
    isDecedent,
    result,
    updatePerson,
    removePerson,
    setDecedentId,
    setNotice,
    onClose,
  }) {
    if (!person) return null;
    const r = result?.byId?.[person.id];
    return (
      <div
        className="inheritance-no-print fixed inset-0 z-[85] flex items-center justify-center bg-ink-900/20 p-3"
        role="dialog"
        aria-modal="true"
        aria-label="編輯人物資料"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="relative flex max-h-[min(90vh,560px)] w-full max-w-lg flex-col border border-ink-100 bg-surface py-3 shadow-subtle rounded-sm">
          <button
            type="button"
            className="absolute right-2 top-2 z-[1] text-ink-400 transition-colors hover:text-accent p-1"
            aria-label="關閉"
            onClick={onClose}
          >
            <i className="ph ph-x text-sm" />
          </button>
          <div className="overflow-y-auto px-3 pr-10 flex flex-col gap-2">
            <div className="flex min-w-0 flex-col gap-0.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-ink-900 leading-none">姓名</label>
              <input
                className={`${TOKENS.input} h-8 w-full min-w-0`}
                value={person.name}
                onChange={(e) => updatePerson(person.id, 'name', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2 items-end">
              <div className="flex min-w-0 flex-col gap-0.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-ink-900 leading-none">出生年月日</label>
                <DateField value={person.birthDate} onChange={(v) => updatePerson(person.id, 'birthDate', v)} />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-ink-900 leading-none">死亡年月日</label>
                <DateField value={person.deathDate} onChange={(v) => updatePerson(person.id, 'deathDate', v)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 items-end">
              <div className="flex w-full min-w-0 flex-col gap-0.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-ink-900 leading-none">出生別</label>
                <input
                  className={`${TOKENS.input} h-8 w-full min-w-0`}
                  value={person.birthOrder}
                  onChange={(e) => updatePerson(person.id, 'birthOrder', e.target.value)}
                />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-ink-900 leading-none">身分證字號</label>
                <input
                  className={`${TOKENS.inputMono} h-8 w-full min-w-0 uppercase`}
                  value={person.idNumber}
                  onChange={(e) => updatePerson(person.id, 'idNumber', e.target.value)}
                />
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-ink-900 leading-none">個案當事人鍵</label>
              <input
                className={`${TOKENS.inputMono} h-8 w-full min-w-0`}
                value={person.casePartyId || ''}
                onChange={(e) => updatePerson(person.id, 'casePartyId', e.target.value)}
              />
              <p className="text-[9px] text-ink-600 leading-snug">與 JCMS 個案串接時對應之主檔識別；可空白。</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {!isDecedent ? (
                <button
                  type="button"
                  className={`${TOKENS.btn.base} ${TOKENS.btn.sub} !px-2 !py-0.5`}
                  onClick={() => {
                    setDecedentId(person.id);
                    setNotice('已設定為被繼承人。');
                  }}
                >
                  設為被繼承人
                </button>
              ) : null}
              <button
                type="button"
                className={`${TOKENS.btn.base} !px-3 !py-1.5 font-bold uppercase tracking-widest bg-accent text-white shadow-subtle hover:bg-black transition-colors`}
                onClick={() => {
                  removePerson(person.id);
                  onClose();
                }}
              >
                刪除
              </button>
            </div>
            {r && !isDecedent ? (
              <p
                className={`text-[10px] font-bold uppercase tracking-wider ${r.status === 'heir' || r.status === 'spouse_heir' ? 'text-accent' : 'text-ink-600'}`}
              >
                {r.note || r.status}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  /** 雙擊配偶連線：婚姻狀態／離婚日 */
  function SpouseBondEditModal({ open, pairIndex, spousePairs, persons, onClose, onApply }) {
    const sp = pairIndex != null ? spousePairs[pairIndex] : null;
    const [bond, setBond] = useState('married');
    const [divorceDate, setDivorceDate] = useState('');
    useEffect(() => {
      if (!open || !sp) return;
      setBond(spouseBond(sp));
      setDivorceDate(sp.divorceDate ? String(sp.divorceDate) : '');
    }, [open, sp, pairIndex]);
    if (!open || !sp || !persons[sp.aId] || !persons[sp.bId]) return null;
    const na = persons[sp.aId].name || '（未命名）';
    const nb = persons[sp.bId].name || '（未命名）';
    return (
      <div
        className="inheritance-no-print fixed inset-0 z-[85] flex items-center justify-center bg-ink-900/20 p-3"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inh-spouse-modal-title"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="flex max-h-[min(90vh,420px)] w-full max-w-md flex-col border border-ink-100 bg-surface shadow-subtle rounded-sm">
          <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-3 py-2">
            <h2 id="inh-spouse-modal-title" className="text-[11px] font-bold uppercase tracking-widest text-ink-900">
              配偶連線
            </h2>
            <button type="button" className="text-ink-400 hover:text-accent transition-colors p-1" aria-label="關閉" onClick={onClose}>
              <i className="ph ph-x text-sm" />
            </button>
          </div>
          <div className="px-3 py-3 flex flex-col gap-3">
            <p className="text-[11px] text-ink-900 leading-snug">
              {na} <span className="text-ink-400">—</span> {nb}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-900 cursor-pointer">
                <input
                  type="radio"
                  name="inh-spouse-edit-bond"
                  checked={bond === 'married'}
                  onChange={() => setBond('married')}
                  className="rounded-sm border-ink-100"
                />
                結婚
              </label>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-900 cursor-pointer">
                <input type="radio" name="inh-spouse-edit-bond" checked={bond === 'divorced'} onChange={() => setBond('divorced')} />
                離婚
              </label>
            </div>
            {bond === 'divorced' ? (
              <div className="flex max-w-[12rem] flex-col gap-0.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-ink-900 leading-none">離婚日期（民國連續數字）</label>
                <DateField value={divorceDate} onChange={setDivorceDate} />
              </div>
            ) : null}
            <div className="flex justify-end gap-2 pt-1 border-t border-ink-100">
              <button type="button" className={`${TOKENS.btn.base} ${TOKENS.btn.sub} !text-[10px] !px-2 !py-1`} onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className={`${TOKENS.btn.base} ${TOKENS.btn.primary} !text-[10px] !px-2 !py-1`}
                onClick={() => onApply(pairIndex, bond, divorceDate)}
              >
                套用
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** 新增親屬：小視窗（Neo-Swiss sheet） */
  function RelateKinModal({
    open,
    onClose,
    anchorId,
    decedentId,
    listCanAddSibling,
    parentsAlreadyComplete,
    onAddChild,
    onAddBothParents,
    onAddSingleParent,
    onAddSpouse,
    onAddSibling,
  }) {
    const [spouseBond, setSpouseBond] = useState('married');
    useEffect(() => {
      if (open) setSpouseBond('married');
    }, [open]);
    if (!open || !anchorId) return null;
    const disabledChild = !anchorId;
    const disabledParentAdd = !anchorId || parentsAlreadyComplete;
    const disabledSpouse = !anchorId;
    const disabledSibling = !listCanAddSibling;

    return (
      <div
        className="inheritance-no-print fixed inset-0 z-[80] flex items-center justify-center bg-ink-900/20 p-3"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inh-relate-title"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="flex max-h-[min(90vh,520px)] w-full max-w-md flex-col border border-ink-100 bg-surface shadow-subtle rounded-sm">
          <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-3 py-2">
            <h2 id="inh-relate-title" className="text-[11px] font-bold uppercase tracking-widest text-ink-900">
              新增關聯親屬
            </h2>
            <button
              type="button"
              className="text-ink-400 hover:text-accent transition-colors p-1"
              aria-label="關閉"
              onClick={onClose}
            >
              <i className="ph ph-x text-sm" />
            </button>
          </div>
          <div className="overflow-y-auto px-3 py-3 flex flex-col gap-3">
            <p className="text-[10px] leading-relaxed text-ink-600">
              將以目前選取之人物為基準新增一筆親屬並連線；新人物會立即出現在右側畫布。
            </p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                disabled={disabledChild}
                className={`${TOKENS.btn.base} ${TOKENS.btn.primary} !text-[10px] !px-2 !py-1 disabled:opacity-40`}
                onClick={() => {
                  onAddChild(anchorId);
                  onClose();
                }}
              >
                加子女
              </button>
              <button
                type="button"
                disabled={disabledParentAdd}
                title={parentsAlreadyComplete ? '已有雙親' : ''}
                className={`${TOKENS.btn.base} ${TOKENS.btn.sub} !text-[10px] !px-2 !py-1 disabled:opacity-40`}
                onClick={() => {
                  onAddBothParents(anchorId);
                  onClose();
                }}
              >
                加雙親
              </button>
              <button
                type="button"
                disabled={disabledParentAdd}
                title={parentsAlreadyComplete ? '已有雙親' : ''}
                className={`${TOKENS.btn.base} ${TOKENS.btn.sub} !text-[10px] !px-2 !py-1 disabled:opacity-40`}
                onClick={() => {
                  onAddSingleParent(anchorId);
                  onClose();
                }}
              >
                加單親
              </button>
            </div>
            <div className="border-t border-ink-100 pt-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-900 mb-1.5">配偶連線（家系圖）</p>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-900 cursor-pointer">
                  <input
                    type="radio"
                    name="inh-spouse-bond"
                    checked={spouseBond === 'married'}
                    onChange={() => setSpouseBond('married')}
                    className="rounded-sm border-ink-100"
                  />
                  結婚（單線）
                </label>
                <label className="inline-flex items-center gap-1.5 text-[11px] text-ink-900 cursor-pointer">
                  <input
                    type="radio"
                    name="inh-spouse-bond"
                    checked={spouseBond === 'divorced'}
                    onChange={() => setSpouseBond('divorced')}
                  />
                  離婚（單線加雙斜線）
                </label>
              </div>
              <button
                type="button"
                disabled={disabledSpouse}
                className={`${TOKENS.btn.base} ${TOKENS.btn.sub} !text-[10px] !px-2 !py-1 disabled:opacity-40`}
                onClick={() => {
                  onAddSpouse(anchorId, spouseBond);
                  onClose();
                }}
              >
                加配偶
              </button>
            </div>
            <div className="border-t border-ink-100 pt-2">
              <button
                type="button"
                disabled={disabledSibling}
                title={
                  disabledSibling
                    ? anchorId !== decedentId
                      ? '請先選取「被繼承人」'
                      : '請先為被繼承人加雙親'
                    : ''
                }
                className={`${TOKENS.btn.base} ${TOKENS.btn.sub} !text-[10px] !px-2 !py-1 disabled:opacity-40`}
                onClick={() => {
                  onAddSibling();
                  onClose();
                }}
              >
                加兄弟姊妹（與被繼承人同父母）
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** 家系圖編輯畫布：可拖曳人物方塊，SVG 符合 genogram 配偶／血親連線慣例 */
  function GenealogyEditCanvas({
    persons,
    positions,
    setPositions,
    selectedIds,
    setSelectedIds,
    parentEdges,
    spousePairs,
    decedentId,
    result,
    canvasRef,
    onAddChild,
    onAddBothParents,
    onAddSingleParent,
    onAddSpouse,
    onAddChildOfCouple,
    onAddSiblingOf,
    onPersonDblClick,
    onSpouseLineDblClick,
    onNodeDragEnd,
  }) {
    const dragRef = useRef(null);
    const ctxMenuRef = useRef(null);
    const [ctxMenu, setCtxMenu] = useState(null);
    const [rubberRect, setRubberRect] = useState(null);
    const rubberListenersRef = useRef(null);

    /** 血緣垂線伸入子女方塊內之深度（px），與筆寬分離避免視覺斷裂；與 genealogyLayout 之 GEN_NODE_H 無耦合。 */
    const BLOOD_INTO_CHILD_PX = 10;

    const bounds = useMemo(() => {
      let w = 960;
      let h = 720;
      Object.keys(persons).forEach((id) => {
        const p = positions[id];
        if (!p) return;
        w = Math.max(w, p.x + GEN_NODE_W + 160);
        h = Math.max(h, p.y + GEN_NODE_H + 160);
      });
      return { w, h };
    }, [persons, positions]);

    useEffect(() => {
      if (!ctxMenu) return;
      const onDocDown = (e) => {
        if (ctxMenuRef.current && ctxMenuRef.current.contains(e.target)) return;
        setCtxMenu(null);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') setCtxMenu(null);
      };
      document.addEventListener('mousedown', onDocDown, true);
      document.addEventListener('keydown', onKey);
      return () => {
        document.removeEventListener('mousedown', onDocDown, true);
        document.removeEventListener('keydown', onKey);
      };
    }, [ctxMenu]);

    useEffect(() => {
      const onMove = (e) => {
        const d = dragRef.current;
        if (!d) return;
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) d.moved = true;
        if (d.mode === 'group' && d.ids && d.origins) {
          setPositions((prev) => {
            const next = { ...prev };
            d.ids.forEach((pid) => {
              const o = d.origins[pid];
              if (!o) return;
              next[pid] = { x: Math.round(o.x + dx), y: Math.round(o.y + dy) };
            });
            return next;
          });
        } else {
          setPositions((prev) => ({
            ...prev,
            [d.id]: { x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) },
          }));
        }
      };
      const onUp = () => {
        const d = dragRef.current;
        if (d && d.moved && typeof onNodeDragEnd === 'function') {
          if (d.mode === 'group' && d.ids && d.ids.length) onNodeDragEnd(d.ids);
          else if (d.id) onNodeDragEnd(d.id);
        }
        dragRef.current = null;
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
      };
    }, [setPositions, onNodeDragEnd]);

    /** 節點錨點：與 genealogyLayout、方塊 style 同一組 GEN_NODE_W×GEN_NODE_H（勿再混用 DOM 量測）。 */
    function nodeAnchor(id) {
      const pos = positions[id] || { x: 0, y: 0 };
      const x0 = pos.x;
      const y0 = pos.y;
      return {
        x: x0,
        y: y0,
        w: GEN_NODE_W,
        h: GEN_NODE_H,
        cx: x0 + GEN_NODE_W / 2,
        cy: y0 + GEN_NODE_H / 2,
        left: x0,
        right: x0 + GEN_NODE_W,
        top: y0,
        bottom: y0 + GEN_NODE_H,
      };
    }

    const bloodPaths = useMemo(() => {
      const paths = [];

      function parentsSortedIds(childId) {
        return getParents(childId, parentEdges)
          .filter((p) => persons[p])
          .slice()
          .sort();
      }

      spousePairs.forEach((sp, spIdx) => {
        if (!persons[sp.aId] || !persons[sp.bId]) return;
        const nuclear = getChildren(sp.aId, parentEdges).filter((c) => {
          if (!getParents(c, parentEdges).includes(sp.bId)) return false;
          const ps = parentsSortedIds(c);
          return ps.length === 2 && hasSpouseEdgeBetween(ps[0], ps[1], spousePairs);
        });
        if (!nuclear.length) return;

        const A = nodeAnchor(sp.aId);
        const B = nodeAnchor(sp.bId);
        const midX = (A.cx + B.cx) / 2;

        const parentBottom = Math.max(A.bottom, B.bottom);
        const childAnchors = nuclear.map((cid) => nodeAnchor(cid));
        const minChildTop = Math.min(...childAnchors.map((a) => a.top));
        const gapVert = minChildTop - parentBottom;
        /** 叉線高度：距離過窄時若仍取正中點，垂線至子女過短會像斷線；上移叉線以保留足夠下垂段 */
        const minDropPx = 14;
        let forkYRaw =
          gapVert > 0 ? parentBottom + gapVert / 2 : parentBottom + Math.max(0, gapVert / 2);
        if (gapVert > 0 && minChildTop - forkYRaw < minDropPx) {
          forkYRaw = Math.max(parentBottom + 2, minChildTop - minDropPx);
        }

        const xs = childAnchors.map((a) => a.cx).sort((a, b) => a - b);
        /** 垂線在雙親中點：子女列可能比雙親更寬，叉線須涵蓋 midX */
        const forkLeft = Math.min(xs[0], midX);
        const forkRight = Math.max(xs[xs.length - 1], midX);

        /** 連線座標用原始數值，避免四捨五入與實際幾何不一致；下垂終點略伸入子女框頂。 */
        const mx = midX;
        const fy = forkYRaw;
        const pb = parentBottom;
        const fl = forkLeft;
        const fr = forkRight;

        paths.push(
          <path
            key={`couple-trunk-${spIdx}`}
            d={`M ${mx} ${pb} L ${mx} ${fy} L ${fl} ${fy} L ${fr} ${fy}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.25}
            strokeLinecap="square"
            strokeLinejoin="miter"
            strokeMiterlimit={8}
            className="pointer-events-none text-ink-900"
            shapeRendering="geometricPrecision"
          />
        );

        nuclear.forEach((cid) => {
          const C = nodeAnchor(cid);
          const cx = C.cx;
          const ctDraw = C.top + BLOOD_INTO_CHILD_PX;
          paths.push(
            <path
              key={`couple-drop-${spIdx}-${cid}`}
              d={`M ${cx} ${fy} L ${cx} ${ctDraw}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.25}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none text-ink-900"
              shapeRendering="geometricPrecision"
            />
          );
        });
      });

      parentEdges.forEach((e, idx) => {
        if (!persons[e.parentId] || !persons[e.childId]) return;
        const pars = parentsSortedIds(e.childId);
        if (pars.length === 2 && hasSpouseEdgeBetween(pars[0], pars[1], spousePairs)) return;

        const P = nodeAnchor(e.parentId);
        const C = nodeAnchor(e.childId);
        const midY = (P.bottom + C.top) / 2;
        const ctIn = C.top + BLOOD_INTO_CHILD_PX;
        const d = `M ${P.cx} ${P.bottom} L ${P.cx} ${midY} L ${C.cx} ${midY} L ${C.cx} ${ctIn}`;
        const adoptive = e.kind === 'adoptive';
        const mx = (P.cx + C.cx) / 2;
        const my = (P.bottom + C.top) / 2;
        paths.push(
          <g key={`b-${idx}`} className="pointer-events-none text-ink-900">
            <path
              d={d}
              fill="none"
              stroke="currentColor"
              strokeWidth={1.25}
              strokeDasharray={adoptive ? '5 4' : undefined}
            />
            {adoptive ? (
              <text x={mx} y={my} textAnchor="middle" className="fill-ink-600" style={{ fontSize: 8, fontFamily: 'ui-sans-serif, sans-serif' }}>
                養
              </text>
            ) : null}
          </g>
        );
      });

      return paths;
    }, [persons, parentEdges, spousePairs, positions]);

    const spouseVisible = [];
    const spouseHit = [];
    spousePairs.forEach((sp, idx) => {
      if (!persons[sp.aId] || !persons[sp.bId]) return;
      const A = nodeAnchor(sp.aId);
      const B = nodeAnchor(sp.bId);
      const left = A.x < B.x ? A : B;
      const right = A.x < B.x ? B : A;
      const lx = left.right;
      const rx = right.left;
      /** 雙方垂直中心平均：偶發錯位時橫線仍居中於兩格（主軌由排版／merge 保證同列）。 */
      const yJoin = (A.cy + B.cy) / 2;
      const bond = spouseBond(sp);
      const pathD = `M ${lx} ${yJoin} L ${rx} ${yJoin}`;
      const midX = (lx + rx) / 2;
      const divNote =
        bond === 'divorced' && sp.divorceDate && String(sp.divorceDate).trim()
          ? `${String(sp.divorceDate).trim()}離婚`
          : '';
      spouseVisible.push(
        <g key={`sv-${idx}`} className="pointer-events-none">
          <path d={pathD} fill="none" stroke="currentColor" strokeWidth={bond === 'divorced' ? 1 : 1.25} className="text-ink-900" />
          {bond === 'divorced' ? (
            <g className="text-ink-900">
              <line
                x1={midX - 10}
                y1={yJoin - 8}
                x2={midX + 2}
                y2={yJoin + 8}
                stroke="currentColor"
                strokeWidth={1.25}
              />
              <line
                x1={midX - 2}
                y1={yJoin - 8}
                x2={midX + 10}
                y2={yJoin + 8}
                stroke="currentColor"
                strokeWidth={1.25}
              />
            </g>
          ) : null}
          {divNote ? (
            <text x={midX} y={yJoin + 14} textAnchor="middle" className="fill-ink-600" style={{ fontSize: 9, fontFamily: 'ui-monospace, monospace' }}>
              {divNote}
            </text>
          ) : null}
        </g>
      );
      spouseHit.push(
        <path
          key={`sh-${idx}`}
          data-inh-spouse-hit="1"
          d={pathD}
          fill="none"
          stroke="transparent"
          strokeWidth={14}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="cursor-context-menu text-ink-900"
          style={{ pointerEvents: 'stroke' }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setCtxMenu({
              kind: 'spouse',
              clientX: e.clientX,
              clientY: e.clientY,
              parentA: sp.aId,
              parentB: sp.bId,
            });
          }}
          onDoubleClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (typeof onSpouseLineDblClick === 'function') onSpouseLineDblClick(idx);
          }}
        />
      );
    });

    const ids = Object.keys(persons);

    const selectedIdsRef = useRef(selectedIds);
    selectedIdsRef.current = selectedIds;

    const menuItems = useMemo(() => {
      const coupleFromSel =
        selectedIds.length === 2 && hasSpouseEdgeBetween(selectedIds[0], selectedIds[1], spousePairs)
          ? [
              {
                label: '新增子女（雙親）',
                disabled: false,
                onPick: () => onAddChildOfCouple(selectedIds[0], selectedIds[1]),
              },
            ]
          : [];

      if (!ctxMenu) return [];

      if (ctxMenu.kind === 'person') {
        const pid = ctxMenu.personId;
        const parentCount = getParents(pid, parentEdges).filter((parId) => persons[parId]).length;
        const parentsFull = parentCount >= 2;
        const parentsHint = parentsFull ? '已有雙親' : '';
        return [
          ...coupleFromSel,
          { label: '新增配偶', disabled: false, onPick: () => onAddSpouse(pid, 'married') },
          { label: '新增子女', disabled: false, onPick: () => onAddChild(pid) },
          {
            label: '新增雙親',
            disabled: parentsFull,
            title: parentsHint,
            onPick: () => onAddBothParents(pid),
          },
          {
            label: '新增單親',
            disabled: parentsFull,
            title: parentsHint,
            onPick: () => onAddSingleParent(pid),
          },
          { label: '新增兄弟姊妹', disabled: false, onPick: () => onAddSiblingOf(pid) },
        ];
      }

      if (ctxMenu.kind === 'spouse') {
        return [
          { label: '新增子女（雙親）', disabled: false, onPick: () => onAddChildOfCouple(ctxMenu.parentA, ctxMenu.parentB) },
        ];
      }

      if (ctxMenu.kind === 'canvas') {
        return coupleFromSel;
      }

      return [];
    }, [
      ctxMenu,
      selectedIds,
      spousePairs,
      persons,
      parentEdges,
      onAddChildOfCouple,
      onAddSpouse,
      onAddChild,
      onAddBothParents,
      onAddSingleParent,
      onAddSiblingOf,
    ]);

    function inhClientToWorld(clientX, clientY, scrollRoot) {
      if (!scrollRoot) return { x: 0, y: 0 };
      const r = scrollRoot.getBoundingClientRect();
      return {
        x: clientX - r.left + scrollRoot.scrollLeft,
        y: clientY - r.top + scrollRoot.scrollTop,
      };
    }

    function endRubberListeners() {
      const L = rubberListenersRef.current;
      if (!L) return;
      window.removeEventListener('pointermove', L.move);
      window.removeEventListener('pointerup', L.up);
      window.removeEventListener('pointercancel', L.up);
      rubberListenersRef.current = null;
    }

    function onCanvasPointerDownCapture(e) {
      if (e.button !== 0 && e.button !== 2) return;
      const root = canvasRef && canvasRef.current;
      if (!root) return;
      const el = e.target;
      if (typeof el.closest === 'function' && (el.closest('[data-inh-person-root]') || el.closest('[data-inh-spouse-hit]')))
        return;
      e.preventDefault();
      endRubberListeners();
      const start = inhClientToWorld(e.clientX, e.clientY, root);
      const move = (ev) => {
        const cur = inhClientToWorld(ev.clientX, ev.clientY, root);
        const x1 = Math.min(start.x, cur.x);
        const y1 = Math.min(start.y, cur.y);
        const x2 = Math.max(start.x, cur.x);
        const y2 = Math.max(start.y, cur.y);
        setRubberRect({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
      };
      const up = (ev) => {
        endRubberListeners();
        setRubberRect(null);
        const cur = inhClientToWorld(ev.clientX, ev.clientY, root);
        const dx = cur.x - start.x;
        const dy = cur.y - start.y;
        if (Math.hypot(dx, dy) > 5) {
          const x1 = Math.min(start.x, cur.x);
          const y1 = Math.min(start.y, cur.y);
          const x2 = Math.max(start.x, cur.x);
          const y2 = Math.max(start.y, cur.y);
          const rw = x2 - x1;
          const rh = y2 - y1;
          const picked = Object.keys(persons).filter((pid) => {
            const po = positions[pid];
            if (!po) return false;
            return rectsIntersect(x1, y1, rw, rh, po.x, po.y, GEN_NODE_W, GEN_NODE_H);
          });
          setSelectedIds(picked);
        } else {
          const sel = selectedIdsRef.current;
          if (sel.length === 2 && hasSpouseEdgeBetween(sel[0], sel[1], spousePairs)) {
            setCtxMenu({ kind: 'canvas', clientX: ev.clientX, clientY: ev.clientY });
          }
        }
      };
      rubberListenersRef.current = { move, up };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      setRubberRect({ x: start.x, y: start.y, w: 0, h: 0 });
    }

    useEffect(() => {
      const onKey = (e) => {
        if (e.key !== 'Escape') return;
        endRubberListeners();
        setRubberRect(null);
      };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, []);

    return (
      <div
        ref={canvasRef}
        className="inheritance-canvas-root print-area relative overflow-auto bg-ink-100/15"
        style={{ minHeight: 'min(70vh, 560px)' }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className="relative"
          style={{ width: bounds.w, height: bounds.h, minWidth: '100%', minHeight: '100%' }}
          onPointerDownCapture={onCanvasPointerDownCapture}
        >
          {ids.map((id) => {
            const p = persons[id];
            const pos = positions[id] || { x: 40, y: 40 };
            const r = result?.byId?.[id];
            const isDec = id === decedentId;
            const isDead = !!(p.deathDate && String(p.deathDate).trim());
            const isHeir = r && (r.status === 'heir' || r.status === 'spouse_heir');
            const sel = selectedIds.includes(id);
            const bo = String(p.birthOrder || '').trim();
            return (
              <div key={id} data-inh-person-root className="absolute" style={{ left: pos.x, top: pos.y, width: GEN_NODE_W }}>
                {isDec ? (
                  <span className="absolute -top-4 left-1/2 z-[2] -translate-x-1/2 font-mono text-[9px] font-bold uppercase tracking-widest text-white whitespace-nowrap pointer-events-none leading-none rounded-sm bg-ink-900 px-1.5 py-0.5 shadow-subtle">
                    被繼承人
                  </span>
                ) : null}
                <div
                  role="button"
                  tabIndex={0}
                  className={`relative flex flex-col justify-center border px-1.5 py-1 shadow-subtle rounded-sm select-none ${
                    isDec
                      ? 'border-2 border-ink-900 bg-panel ring-2 ring-ink-900/30 shadow-subtle'
                      : sel
                        ? 'border-ink-900 bg-panel ring-1 ring-ink-900/20'
                        : isHeir
                          ? 'border-accent bg-ink-100/15'
                          : 'border-ink-100 bg-surface'
                  } ${isDead && !isHeir && !isDec ? 'text-ink-600' : 'text-ink-900'} cursor-grab active:cursor-grabbing`}
                  style={{
                    width: GEN_NODE_W,
                    height: GEN_NODE_H,
                    minHeight: GEN_NODE_H,
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                  }}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    e.stopPropagation();
                    if (e.ctrlKey || e.metaKey) {
                      setSelectedIds((prev) => {
                        if (prev.includes(id)) return prev.filter((x) => x !== id);
                        return [...prev, id];
                      });
                      return;
                    }
                    const multiSel = selectedIds.includes(id) && selectedIds.length > 1;
                    if (multiSel) {
                      const origins = {};
                      selectedIds.forEach((pid) => {
                        const po = positions[pid] || { x: 0, y: 0 };
                        origins[pid] = { x: po.x, y: po.y };
                      });
                      dragRef.current = {
                        mode: 'group',
                        ids: [...selectedIds],
                        sx: e.clientX,
                        sy: e.clientY,
                        origins,
                        moved: false,
                      };
                    } else {
                      setSelectedIds([id]);
                      dragRef.current = {
                        mode: 'single',
                        id,
                        sx: e.clientX,
                        sy: e.clientY,
                        ox: pos.x,
                        oy: pos.y,
                        moved: false,
                      };
                    }
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch (err) {
                      /* noop */
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setSelectedIds([id]);
                    if (typeof onPersonDblClick === 'function') onPersonDblClick(id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSelectedIds((prev) => (prev.includes(id) ? prev : [id]));
                    setCtxMenu({
                      kind: 'person',
                      clientX: e.clientX,
                      clientY: e.clientY,
                      personId: id,
                    });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedIds([id]);
                    }
                  }}
                >
                  {bo ? (
                    <div className="text-[9px] font-bold text-ink-900 text-center leading-none truncate">出生別 {bo}</div>
                  ) : null}
                  <div
                    className={`truncate text-center font-bold leading-tight ${isDec ? 'text-[12px] text-ink-900' : 'text-[11px] text-ink-900'}`}
                  >
                    {p.name || '（未命名）'}
                  </div>
                  <div className="text-[9px] font-mono tabular-nums text-ink-900 text-center leading-tight">
                    生 {formatRocDateDisplay(p.birthDate)} 歿 {formatRocDateDisplay(p.deathDate)}
                  </div>
                  <div className="text-[9px] font-mono tabular-nums text-ink-600 text-center truncate leading-tight">
                    {String(p.idNumber || '').trim() || '—'}
                  </div>
                </div>
              </div>
            );
          })}
          <svg
            className="absolute left-0 top-0 text-ink-900 pointer-events-none"
            width={bounds.w}
            height={bounds.h}
            overflow="visible"
            aria-hidden
          >
            {bloodPaths}
            {spouseVisible}
          </svg>
          {/** 全幅 SVG 預設會吃掉整層 hit-test；須 none 讓右鍵傳到人物卡，配偶 path 再以 stroke 單獨接事件。 */}
          <svg
            className="absolute left-0 top-0 pointer-events-none text-ink-900"
            width={bounds.w}
            height={bounds.h}
            overflow="visible"
            aria-hidden
          >
            {spouseHit}
          </svg>
          {rubberRect ? (
            <div
              className="pointer-events-none absolute z-[5] border border-dashed border-ink-900 bg-ink-100/15"
              style={{
                left: rubberRect.x,
                top: rubberRect.y,
                width: Math.max(rubberRect.w, 0),
                height: Math.max(rubberRect.h, 0),
              }}
              aria-hidden
            />
          ) : null}
        </div>
        {ctxMenu && menuItems.length > 0 ? (
          <div
            ref={ctxMenuRef}
            className="inheritance-no-print fixed z-[90] min-w-[11rem] border border-ink-100 bg-surface py-1 shadow-subtle rounded-sm"
            style={{
              left: Math.max(
                4,
                Math.min(
                  ctxMenu.clientX,
                  (typeof window !== 'undefined' ? window.innerWidth : ctxMenu.clientX + 200) - 200
                )
              ),
              top: Math.max(
                4,
                Math.min(
                  ctxMenu.clientY,
                  (typeof window !== 'undefined' ? window.innerHeight : ctxMenu.clientY + 220) - 180
                )
              ),
            }}
            role="menu"
          >
            {menuItems.map((item, mi) => (
              <button
                key={`${item.label}-${mi}`}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                title={item.title || undefined}
                className="flex w-full items-center px-3 py-1.5 text-left text-[11px] font-bold text-ink-900 hover:bg-panel disabled:opacity-40 disabled:hover:bg-surface"
                onClick={() => {
                  if (!item.disabled) item.onPick();
                  setCtxMenu(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  function emptyPersonRecord(id) {
    return {
      id,
      name: '',
      birthOrder: '',
      birthDate: '',
      deathDate: '',
      idNumber: '',
      casePartyId: '',
    };
  }

  function InheritanceChartApp() {
    const fileRef = useRef(null);
    const seedRef = useRef(null);
    if (!seedRef.current) {
      const id = newPersonId();
      seedRef.current = {
        id,
        persons: { [id]: emptyPersonRecord(id) },
        position: { x: 380, y: 260 },
      };
    }
    const [persons, setPersons] = useState(() => seedRef.current.persons);
    const [decedentId, setDecedentId] = useState(() => seedRef.current.id);
    const [selectedIds, setSelectedIds] = useState(() => [seedRef.current.id]);
    const [parentEdges, setParentEdges] = useState([]);
    const [spousePairs, setSpousePairs] = useState([]);
    const [nodePositions, setNodePositions] = useState(() => ({
      [seedRef.current.id]: seedRef.current.position,
    }));
    const [notice, setNotice] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [pdfGen, setPdfGen] = useState(false);
    const [relateModalOpen, setRelateModalOpen] = useState(false);
    const [personModalId, setPersonModalId] = useState(null);
    const [spouseEditIdx, setSpouseEditIdx] = useState(null);
    const [batchImportOpen, setBatchImportOpen] = useState(false);
    const [batchJsonText, setBatchJsonText] = useState('');
    const [caseCompareOpen, setCaseCompareOpen] = useState(false);
    const [caseCompareText, setCaseCompareText] = useState('[]');
    const [caseCompareResult, setCaseCompareResult] = useState('');
    const canvasPrintRef = useRef(null);
    /** 曾以拖曳移動過之人物 id；自動排版時保留橫向 x，縱向 y 仍依親等列對齊 */
    const positionPinnedRef = useRef(new Set());
    const undoStackRef = useRef([]);
    const MAX_UNDO = 50;

    const pushUndo = useCallback(() => {
      undoStackRef.current.push({
        persons: JSON.parse(JSON.stringify(persons)),
        parentEdges: parentEdges.map((e) => ({ ...e })),
        spousePairs: JSON.parse(JSON.stringify(spousePairs)),
        nodePositions: JSON.parse(JSON.stringify(nodePositions)),
        decedentId,
        selectedIds: [...selectedIds],
        pinned: Array.from(positionPinnedRef.current),
      });
      if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    }, [persons, parentEdges, spousePairs, nodePositions, decedentId, selectedIds]);

    const popUndo = useCallback(() => {
      const st = undoStackRef.current.pop();
      if (!st) {
        setNotice('沒有可回復的動作。');
        return;
      }
      setPersons(st.persons);
      setParentEdges(st.parentEdges);
      setSpousePairs(st.spousePairs);
      setNodePositions(st.nodePositions);
      setDecedentId(st.decedentId);
      setSelectedIds(st.selectedIds);
      positionPinnedRef.current = new Set(st.pinned || []);
      setNotice('已回復上一動。');
    }, []);

    /** 拖曳放開：投影回該人物親等層之 Y；可傳單一 id 或 id 陣列（框選多時一起對齊）。 */
    const handleNodeDragEnd = useCallback(
      (idOrIds) => {
        const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
        setNodePositions((prev) => {
          const depths = GL.computeDepthMap(persons, parentEdges);
          GL.alignSpouseDepths(depths, persons, spousePairs);
          const next = { ...prev };
          ids.forEach((id) => {
            if (!persons[id]) return;
            positionPinnedRef.current.add(id);
            const d = depths[id];
            if (d === undefined) return;
            const y = GL.layerYForDepth(d);
            const cur = next[id] || prev[id] || { x: 0, y: 0 };
            next[id] = { x: cur.x, y };
          });
          return next;
        });
      },
      [persons, parentEdges, spousePairs]
    );

    const relayoutFullGraph = useCallback(() => {
      pushUndo();
      positionPinnedRef.current.clear();
      setNodePositions(layoutGenealogyPositions(persons, parentEdges, spousePairs));
      setNotice('已重新自動排列（已清除拖曳固定）。');
    }, [persons, parentEdges, spousePairs, pushUndo]);

    const applyBatchJson = useCallback(
      (raw) => {
        let data;
        try {
          data = JSON.parse(raw || '{}');
        } catch (e) {
          setNotice('JSON 解析失敗。');
          return;
        }
        const v = validateBatchInheritancePayload(data);
        if (!v.ok) {
          setNotice(v.errs.join('；'));
          return;
        }
        pushUndo();
        const seenPair = new Set();
        const spList = [];
        for (const s of data.spousePairs || []) {
          if (!s || !s.aId || !s.bId) continue;
          const n = normalizeSpousePair(s.aId, s.bId, s.bond, s.divorceDate);
          const k = `${n.aId}\0${n.bId}`;
          if (seenPair.has(k)) continue;
          seenPair.add(k);
          spList.push(n);
        }
        const pe = (data.parentEdges || []).map(normalizeParentEdge).filter(Boolean);
        const nextPersons = data.persons;
        positionPinnedRef.current.clear();
        setPersons(nextPersons);
        setDecedentId(data.decedentId || null);
        setParentEdges(pe);
        setSpousePairs(spList);
        setNodePositions(layoutGenealogyPositions(nextPersons, pe, spList));
        setSelectedIds([]);
        setBatchImportOpen(false);
        setNotice('已套用批次 JSON（已重新排版）。');
      },
      [pushUndo]
    );

    const runCaseCompare = useCallback(() => {
      let rows;
      try {
        rows = JSON.parse(caseCompareText || '[]');
      } catch (e) {
        setNotice('比對資料 JSON 無效。');
        return;
      }
      if (!Array.isArray(rows)) {
        setNotice('比對資料須為 JSON 陣列。');
        return;
      }
      const byKey = {};
      Object.values(persons).forEach((p) => {
        const k = String(p.casePartyId || '').trim();
        if (k) byKey[k] = p;
      });
      const lines = [];
      rows.forEach((row) => {
        const k = String(row.casePartyId || '').trim();
        const nm = String(row.name || '').trim();
        if (!k) {
          lines.push('（略過一列：無 casePartyId）');
          return;
        }
        const p = byKey[k];
        if (!p) lines.push(`缺：圖中無鍵「${k}」`);
        else if ((p.name || '').trim() !== nm)
          lines.push(`差異「${k}」：個案「${nm}」／圖「${(p.name || '').trim()}」`);
        else lines.push(`一致「${k}」：${nm}`);
      });
      setCaseCompareResult(lines.join('\n'));
      setNotice('比對完成；見視窗內結果。');
    }, [persons, caseCompareText]);

    const graphRef = useRef({ persons, parentEdges, spousePairs });
    graphRef.current = { persons, parentEdges, spousePairs };

    const personIdSetKey = Object.keys(persons)
      .sort()
      .join('|');

    const primarySelectedId = useMemo(
      () => (selectedIds.length ? selectedIds[selectedIds.length - 1] : null),
      [selectedIds]
    );

    const handleListSelect = useCallback((id, e) => {
      if (e && (e.ctrlKey || e.metaKey)) {
        setSelectedIds((prev) => {
          if (prev.includes(id)) return prev.filter((x) => x !== id);
          return [...prev, id];
        });
      } else {
        setSelectedIds([id]);
      }
    }, []);

    useEffect(() => {
      if (Object.keys(persons).length > 0) return;
      const id = newPersonId();
      setPersons({ [id]: emptyPersonRecord(id) });
      setDecedentId(id);
      setSelectedIds([id]);
      setNodePositions({ [id]: { x: 380, y: 260 } });
    }, [persons]);

    /** 拓樸（人員集合、親子邊、配偶邊）變更時與自動排版合併；曾拖曳者保留橫向位置、縱向隨親等列更新 */
    useEffect(() => {
      setNodePositions((prev) => {
        const { persons: p, parentEdges: pe, spousePairs: sp } = graphRef.current;
        const laid = layoutGenealogyPositions(p, pe, sp);
        return mergeLayoutKeepingPins(prev, laid, positionPinnedRef.current);
      });
    }, [personIdSetKey, parentEdges, spousePairs]);

    const model = useMemo(
      () => ({ persons, decedentId, parentEdges, spousePairs, nodePositions }),
      [persons, decedentId, parentEdges, spousePairs, nodePositions]
    );

    const result = useMemo(() => computeInheritance(model), [model]);

    const updatePerson = useCallback((id, field, val) => {
      setPersons((prev) => ({
        ...prev,
        [id]: { ...prev[id], [field]: val },
      }));
    }, []);

    const removePersonsByIds = useCallback(
      (rawIds) => {
        const uniq = [...new Set(rawIds)].filter((id) => persons[id]);
        if (!uniq.length) return;
        pushUndo();
        const idsSet = new Set(uniq);
        const nextPersons = { ...persons };
        uniq.forEach((id) => delete nextPersons[id]);
        const nextEdges = parentEdges.filter((e) => !idsSet.has(e.parentId) && !idsSet.has(e.childId));
        const nextSpouse = spousePairs.filter((p) => !idsSet.has(p.aId) && !idsSet.has(p.bId));
        positionPinnedRef.current.clear();
        setPersons(nextPersons);
        setParentEdges(nextEdges);
        setSpousePairs(nextSpouse);
        setNodePositions(layoutGenealogyPositions(nextPersons, nextEdges, nextSpouse));
        if (decedentId && idsSet.has(decedentId)) setDecedentId(null);
        setSelectedIds((prev) => prev.filter((x) => !idsSet.has(x)));
      },
      [persons, parentEdges, spousePairs, decedentId, pushUndo]
    );

    const removePerson = useCallback((id) => removePersonsByIds([id]), [removePersonsByIds]);

    const removeSelectedPersons = useCallback(
      () => removePersonsByIds(selectedIds),
      [selectedIds, removePersonsByIds]
    );

    useEffect(() => {
      const onKey = (e) => {
        const el = e.target;
        const tag = el && el.tagName;
        const inField =
          tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable);
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
          if (inField) return;
          e.preventDefault();
          popUndo();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
          if (inField) return;
          e.preventDefault();
          setSelectedIds(Object.keys(persons));
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'l') {
          if (inField) return;
          e.preventDefault();
          relayoutFullGraph();
          return;
        }
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        if (inField) return;
        if (!selectedIds.length) return;
        e.preventDefault();
        removeSelectedPersons();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [selectedIds, removeSelectedPersons, popUndo, relayoutFullGraph, persons]);

    const addChildOf = useCallback(
      (parentId) => {
        pushUndo();
        const id = newPersonId();
        const nextPersons = { ...persons, [id]: emptyPersonRecord(id) };
        const nextEdges = [...parentEdges, { parentId, childId: id }];
        positionPinnedRef.current.clear();
        setPersons(nextPersons);
        setParentEdges(nextEdges);
        setNodePositions(layoutGenealogyPositions(nextPersons, nextEdges, spousePairs));
        setSelectedIds([id]);
        setNotice('已新增子女；已重新自動排版。');
      },
      [persons, parentEdges, spousePairs, pushUndo]
    );

    const addBothParentsOf = useCallback(
      (childId) => {
        if (!persons[childId]) return;
        const existing = getParents(childId, parentEdges).filter((p) => persons[p]);
        if (existing.length >= 2) {
          setNotice('此人物已有雙親。');
          return;
        }
        pushUndo();
        if (existing.length === 0) {
          const p1 = newPersonId();
          const p2 = newPersonId();
          const nextPersons = { ...persons, [p1]: emptyPersonRecord(p1), [p2]: emptyPersonRecord(p2) };
          const nextEdges = [...parentEdges, { parentId: p1, childId }, { parentId: p2, childId }];
          const nextSpouse = [...spousePairs, normalizeSpousePair(p1, p2, 'married')];
          positionPinnedRef.current.clear();
          setPersons(nextPersons);
          setParentEdges(nextEdges);
          setSpousePairs(nextSpouse);
          setNodePositions(layoutGenealogyPositions(nextPersons, nextEdges, nextSpouse));
          setSelectedIds([p1, p2]);
          setNotice('已新增雙親並連線；已重新自動排版。');
          return;
        }
        const ex = existing[0];
        const p2 = newPersonId();
        const nextPersons = { ...persons, [p2]: emptyPersonRecord(p2) };
        const nextEdges = [...parentEdges, { parentId: p2, childId }];
        const nextSpouse = [...spousePairs, normalizeSpousePair(ex, p2, 'married')];
        positionPinnedRef.current.clear();
        setPersons(nextPersons);
        setParentEdges(nextEdges);
        setSpousePairs(nextSpouse);
        setNodePositions(layoutGenealogyPositions(nextPersons, nextEdges, nextSpouse));
        setSelectedIds([p2]);
        setNotice('已補齊另一親並締結配偶連線；已重新自動排版。');
      },
      [persons, parentEdges, spousePairs, pushUndo]
    );

    /** 新增單線親子：僅一連線至目標人物（不自動締結配偶）。已有雙親時禁止。 */
    const addSingleParentOf = useCallback(
      (childId) => {
        if (!persons[childId]) return;
        const existing = getParents(childId, parentEdges).filter((p) => persons[p]);
        if (existing.length >= 2) {
          setNotice('此人物已有雙親。');
          return;
        }
        pushUndo();
        const id = newPersonId();
        const nextPersons = { ...persons, [id]: emptyPersonRecord(id) };
        const nextEdges = [...parentEdges, { parentId: id, childId }];
        positionPinnedRef.current.clear();
        setPersons(nextPersons);
        setParentEdges(nextEdges);
        setNodePositions(layoutGenealogyPositions(nextPersons, nextEdges, spousePairs));
        setSelectedIds([id]);
        setNotice('已新增單親並連線；已重新自動排版。');
      },
      [persons, parentEdges, spousePairs, pushUndo]
    );

    const addSpouseOf = useCallback(
      (personId, bond) => {
        pushUndo();
        const id = newPersonId();
        const b = bond === 'divorced' ? 'divorced' : 'married';
        const nextPersons = { ...persons, [id]: emptyPersonRecord(id) };
        const nextSpouse = [...spousePairs, normalizeSpousePair(personId, id, b)];
        positionPinnedRef.current.clear();
        setPersons(nextPersons);
        setSpousePairs(nextSpouse);
        setNodePositions(layoutGenealogyPositions(nextPersons, parentEdges, nextSpouse));
        setSelectedIds([id]);
        setNotice('已新增配偶並連線；已重新自動排版。');
      },
      [persons, parentEdges, spousePairs, pushUndo]
    );

    /** 於配偶連線上新增子女：同時建立與雙親之親子邊 */
    const addChildOfCouple = useCallback(
      (parentA, parentB) => {
        pushUndo();
        const id = newPersonId();
        const nextPersons = { ...persons, [id]: emptyPersonRecord(id) };
        const nextEdges = [
          ...parentEdges,
          { parentId: parentA, childId: id },
          { parentId: parentB, childId: id },
        ];
        positionPinnedRef.current.clear();
        setPersons(nextPersons);
        setParentEdges(nextEdges);
        setNodePositions(layoutGenealogyPositions(nextPersons, nextEdges, spousePairs));
        setSelectedIds([id]);
        setNotice('已新增子女（雙親）；已重新自動排版。');
      },
      [persons, parentEdges, spousePairs, pushUndo]
    );

    const addSiblingOfPerson = useCallback(
      (anchorId) => {
        if (!persons[anchorId]) return;
        const pars = getParents(anchorId, parentEdges).filter((p) => persons[p]);
        if (pars.length === 1) {
          setNotice('請先為該人物補齊雙親後，再加入兄弟姊妹。');
          return;
        }
        pushUndo();
        const sibId = newPersonId();
        if (!pars.length) {
          const p1 = newPersonId();
          const p2 = newPersonId();
          const nextPersons = {
            ...persons,
            [p1]: emptyPersonRecord(p1),
            [p2]: emptyPersonRecord(p2),
            [sibId]: emptyPersonRecord(sibId),
          };
          const nextEdges = [
            ...parentEdges,
            { parentId: p1, childId: anchorId },
            { parentId: p2, childId: anchorId },
            { parentId: p1, childId: sibId },
            { parentId: p2, childId: sibId },
          ];
          const nextSpouse = [...spousePairs, normalizeSpousePair(p1, p2, 'married')];
          positionPinnedRef.current.clear();
          setPersons(nextPersons);
          setParentEdges(nextEdges);
          setSpousePairs(nextSpouse);
          setNodePositions(layoutGenealogyPositions(nextPersons, nextEdges, nextSpouse));
          setSelectedIds([sibId]);
          setNotice('已新增雙親與兄弟姊妹；已重新自動排版。');
          return;
        }
        const nextPersons = { ...persons, [sibId]: emptyPersonRecord(sibId) };
        const nextEdges = [...parentEdges];
        pars.forEach((parId) => {
          if (!nextEdges.some((e) => e.parentId === parId && e.childId === sibId)) {
            nextEdges.push({ parentId: parId, childId: sibId });
          }
        });
        positionPinnedRef.current.clear();
        setPersons(nextPersons);
        setParentEdges(nextEdges);
        setNodePositions(layoutGenealogyPositions(nextPersons, nextEdges, spousePairs));
        setSelectedIds([sibId]);
        setNotice('已新增兄弟姊妹；已重新自動排版。');
      },
      [persons, parentEdges, spousePairs, pushUndo]
    );

    const addSiblingOfDecedent = useCallback(() => {
      if (!decedentId) return;
      addSiblingOfPerson(decedentId);
    }, [decedentId, addSiblingOfPerson]);

    const saveMd = useCallback(() => {
      const md = buildMdFile(model);
      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `繼承系統表-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
      setNotice('已下載 MD 檔。');
    }, [model]);

    const onPickFile = useCallback((e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || '');
        const parsed = parseLoadedMd(text);
        if (!parsed) {
          setNotice('無法解析 MD：請確認內含 ```json``` 區塊。');
          return;
        }
        pushUndo();
        const loadedPersons = parsed.persons || {};
        const loadedEdges = parsed.parentEdges || [];
        const loadedSpouse = parsed.spousePairs || [];
        setPersons(loadedPersons);
        setDecedentId(parsed.decedentId || null);
        setParentEdges(loadedEdges);
        setSpousePairs(loadedSpouse);
        positionPinnedRef.current.clear();
        setNodePositions(layoutGenealogyPositions(loadedPersons, loadedEdges, loadedSpouse));
        setSelectedIds([]);
        setNotice('已載入檔案（已重新排版對齊；拖曳固定已清除）。');
      };
      reader.readAsText(f, 'UTF-8');
      e.target.value = '';
    }, [pushUndo]);

    const handleSavePdf = useCallback(async () => {
      const el = canvasPrintRef.current;
      if (!el) {
        setNotice('無法匯出：預覽區尚未就緒。');
        return;
      }
      const html2canvasFn = window.html2canvas;
      const JsPdfCtor = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
      const hasDeterministicExporter = typeof html2canvasFn === 'function' && typeof JsPdfCtor === 'function';
      const hasHtml2Pdf = typeof window.html2pdf === 'function';
      if (!hasDeterministicExporter && !hasHtml2Pdf) {
        setNotice('PDF 匯出模組未載入，請確認已載入 vendor/html2pdf.bundle.min.js。');
        return;
      }
      setPdfGen(true);
      setNotice('');
      try {
        const fn = `繼承系統表-${new Date().toISOString().slice(0, 10)}.pdf`;
        void el.offsetHeight;
        if (hasDeterministicExporter) {
          const pdf = new JsPdfCtor({ unit: 'mm', format: 'a4', orientation: 'portrait' });
          const canvas = await html2canvasFn(el, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0,
          });
          const img = canvas.toDataURL('image/jpeg', 0.92);
          pdf.addImage(img, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
          pdf.save(fn);
        } else {
          await window.html2pdf().set({
            margin: 0,
            filename: fn,
            image: { type: 'jpeg', quality: 0.92 },
            html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          }).from(el).save();
        }
        setNotice('已下載 PDF。');
      } catch (e) {
        console.error(e);
        setNotice('PDF 產生失敗，請稍後再試。');
      } finally {
        setPdfGen(false);
      }
    }, []);

    const pdfDisabled = pdfGen || !decedentId || !persons[decedentId];

    const listCanAddSibling =
      !!primarySelectedId &&
      decedentId &&
      primarySelectedId === decedentId &&
      getParents(decedentId, parentEdges).length > 0;

    const parentsAlreadyComplete = useMemo(() => {
      if (!primarySelectedId || !persons[primarySelectedId]) return false;
      return getParents(primarySelectedId, parentEdges).filter((parId) => persons[parId]).length >= 2;
    }, [primarySelectedId, parentEdges, persons]);

    return (
      <div className="relative flex h-full min-h-0 w-full overflow-hidden bg-surface text-ink-900 font-sans">
        <aside className="inheritance-no-print flex h-full min-h-0 w-[min(100%,400px)] sm:w-[400px] shrink-0 flex-col border-r border-ink-100 bg-surface">
          <header className="shrink-0 bg-surface px-4 pb-0 pt-3">
            <div className="flex items-center gap-x-2 gap-y-0">
              <h1 className="text-[15px] font-bold leading-tight tracking-tight text-ink-900">繼承系統表製作工具</h1>
              <button
                type="button"
                className="ml-auto inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-ink-600 transition-colors hover:text-ink-900"
                aria-label={settingsOpen ? '關閉選項' : '開啟選項'}
                title="讀取 MD 檔"
                onClick={() => setSettingsOpen((o) => !o)}
              >
                <i className="ph ph-gear-six text-[15px]" aria-hidden />
              </button>
            </div>
            <p className="mb-2 text-[9px] font-mono font-bold uppercase tracking-widest text-ink-400">
              INHERITANCE CHART EDITOR
            </p>
          </header>

          <div
            className={`flex min-h-0 flex-1 flex-col overflow-y-auto ${settingsOpen ? 'gap-2' : 'gap-3'} px-3 pb-2 pt-0 sm:px-4`}
          >
            {settingsOpen ? (
              <section className="shrink-0 rounded-sm border border-ink-100 bg-panel p-1.5">
                <div className="flex h-7 min-w-0 items-center justify-end gap-2">
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-ink-400 transition-colors hover:text-accent"
                    aria-label="關閉"
                    onClick={() => setSettingsOpen(false)}
                  >
                    <i className="ph ph-x text-sm" aria-hidden />
                  </button>
                </div>
                <div className="mt-0.5">
                  <button
                    type="button"
                    className="inline-flex h-8 w-full min-w-0 items-center justify-center rounded-sm border border-ink-100 bg-surface px-3 text-[10px] font-bold uppercase tracking-widest text-ink-900 transition-colors hover:border-ink-900"
                    onClick={() => fileRef.current && fileRef.current.click()}
                  >
                    讀取 MD 檔
                  </button>
                </div>
              </section>
            ) : null}

            <input
              ref={fileRef}
              type="file"
              accept=".md,.markdown,text/markdown"
              className="hidden"
              onChange={onPickFile}
            />

            {notice ? (
              <div className="shrink-0 rounded-sm border border-ink-100 bg-panel px-2 py-1.5 text-[11px] text-ink-900" role="status">
                {notice}
              </div>
            ) : null}

            {result.error &&
            result.error !== '請設定被繼承人死亡年月日作為繼承開始時點。' ? (
              <div className="shrink-0 rounded-sm border border-ink-100 bg-panel px-2 py-1.5 text-[11px] text-accent">{result.error}</div>
            ) : null}

            <div className="mt-1 shrink-0 border-t border-ink-100 pt-3 pb-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-ink-900">人物清單</div>
              <div className="mt-2 flex flex-col gap-1">
                <PersonTreeList
                  persons={persons}
                  parentEdges={parentEdges}
                  spousePairs={spousePairs}
                  selectedIds={selectedIds}
                  onSelect={handleListSelect}
                  decedentId={decedentId}
                  result={result}
                  personIdSetKey={personIdSetKey}
                  onSetDecedent={(id) => {
                    setDecedentId(id);
                    setNotice('已設定被繼承人。');
                  }}
                />
              </div>
            </div>
          </div>

          <div className="inheritance-no-print flex shrink-0 flex-row gap-2 border-t border-ink-100 bg-panel p-3">
            <button
              type="button"
              onClick={saveMd}
              className="inline-flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-sm border border-ink-900 bg-surface px-2 text-[10px] font-bold uppercase tracking-widest text-ink-900 shadow-subtle transition-colors hover:bg-ink-100/15"
            >
              <i className="ph ph-floppy-disk text-sm shrink-0" aria-hidden />
              儲存成 MD 檔
            </button>
            <button
              type="button"
              onClick={handleSavePdf}
              disabled={pdfDisabled}
              className="inline-flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-sm bg-ink-900 px-2 text-[10px] font-bold uppercase tracking-widest text-white shadow-subtle transition-colors hover:bg-black disabled:pointer-events-none disabled:opacity-40"
            >
              <i className="ph ph-download-simple text-sm shrink-0" aria-hidden />
              {pdfGen ? '產生中…' : '另存 PDF'}
            </button>
          </div>
        </aside>

        <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-ink-100/15">
          {!result.error && result.activeOrder != null ? (
            <div className="inheritance-no-print shrink-0 border-b border-ink-100 bg-panel px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-ink-600">
              作用順位：
              {result.activeOrder === 'spouse_only'
                ? '僅配偶（無其他順位繼承人）'
                : `第 ${result.activeOrder} 順位`}
              {result.spouseHeir ? ' · 配偶共同繼承' : ''}
            </div>
          ) : null}
          <div className="inheritance-no-print flex shrink-0 flex-wrap items-center gap-2 border-b border-ink-100 bg-surface px-3 py-1.5">
            <button
              type="button"
              onClick={() => setSelectedIds(Object.keys(persons))}
              className={`${TOKENS.btn.base} ${TOKENS.btn.sub} !text-[10px] !px-2 !py-1`}
            >
              全選人物
            </button>
            <button
              type="button"
              onClick={relayoutFullGraph}
              className={`${TOKENS.btn.base} ${TOKENS.btn.primary} !text-[10px] !px-2 !py-1 shadow-subtle`}
            >
              自動排列
            </button>
            <button
              type="button"
              onClick={() => setBatchImportOpen(true)}
              className={`${TOKENS.btn.base} ${TOKENS.btn.sub} !text-[10px] !px-2 !py-1`}
            >
              批次 JSON
            </button>
            <button
              type="button"
              onClick={() => setCaseCompareOpen(true)}
              className={`${TOKENS.btn.base} ${TOKENS.btn.sub} !text-[10px] !px-2 !py-1`}
            >
              比對個案鍵
            </button>
            <span className="ml-auto text-[9px] font-mono tabular-nums text-ink-400">
              Ctrl+A 全選 · Ctrl+L 排列 · 養親虛線 · 拖曳鎖橫向
            </span>
          </div>
          <GenealogyEditCanvas
            persons={persons}
            positions={nodePositions}
            setPositions={setNodePositions}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            parentEdges={parentEdges}
            spousePairs={spousePairs}
            decedentId={decedentId}
            result={result}
            canvasRef={canvasPrintRef}
            onAddChild={addChildOf}
            onAddBothParents={addBothParentsOf}
            onAddSpouse={addSpouseOf}
            onAddChildOfCouple={addChildOfCouple}
            onPersonDblClick={(id) => setPersonModalId(id)}
            onSpouseLineDblClick={(idx) => setSpouseEditIdx(idx)}
            onNodeDragEnd={handleNodeDragEnd}
            onAddSingleParent={addSingleParentOf}
            onAddSiblingOf={addSiblingOfPerson}
          />
          {personModalId && persons[personModalId] ? (
            <PersonCanvasEditModal
              person={persons[personModalId]}
              isDecedent={personModalId === decedentId}
              result={result}
              updatePerson={updatePerson}
              removePerson={removePerson}
              setDecedentId={setDecedentId}
              setNotice={setNotice}
              onClose={() => setPersonModalId(null)}
            />
          ) : null}
          <SpouseBondEditModal
            open={spouseEditIdx != null}
            pairIndex={spouseEditIdx}
            spousePairs={spousePairs}
            persons={persons}
            onClose={() => setSpouseEditIdx(null)}
            onApply={(idx, bond, divorceDate) => {
              setSpousePairs((prev) => {
                const next = [...prev];
                const cur = next[idx];
                if (!cur) return prev;
                next[idx] = normalizeSpousePair(
                  cur.aId,
                  cur.bId,
                  bond,
                  bond === 'divorced' ? divorceDate : undefined
                );
                return next;
              });
              setSpouseEditIdx(null);
              setNotice('已更新婚姻連線。');
            }}
          />
          <RelateKinModal
            open={relateModalOpen}
            onClose={() => setRelateModalOpen(false)}
            anchorId={primarySelectedId}
            decedentId={decedentId}
            listCanAddSibling={listCanAddSibling}
            parentsAlreadyComplete={parentsAlreadyComplete}
            onAddChild={addChildOf}
            onAddBothParents={addBothParentsOf}
            onAddSingleParent={addSingleParentOf}
            onAddSpouse={addSpouseOf}
            onAddSibling={addSiblingOfDecedent}
          />
          {batchImportOpen ? (
            <div
              className="inheritance-no-print fixed inset-0 z-[86] flex items-center justify-center bg-ink-900/20 p-3"
              role="dialog"
              aria-modal="true"
              aria-labelledby="inh-batch-title"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setBatchImportOpen(false);
              }}
            >
              <div className="flex max-h-[min(90vh,560px)] w-full max-w-xl flex-col border border-ink-100 bg-surface shadow-subtle rounded-sm">
                <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-3 py-2">
                  <h2 id="inh-batch-title" className="text-[11px] font-bold uppercase tracking-widest text-ink-900">
                    批次匯入 JSON
                  </h2>
                  <button
                    type="button"
                    className="text-ink-400 hover:text-accent transition-colors p-1"
                    aria-label="關閉"
                    onClick={() => setBatchImportOpen(false)}
                  >
                    <i className="ph ph-x text-sm" />
                  </button>
                </div>
                <div className="flex flex-col gap-2 px-3 py-3">
                  <p className="text-[10px] leading-relaxed text-ink-600">
                    貼上完整模型 JSON（persons、parentEdges、spousePairs、decedentId）；套用前會記錄 undo。
                  </p>
                  <textarea
                    className={`${TOKENS.input} min-h-[12rem] w-full resize-y font-mono text-[11px]`}
                    value={batchJsonText}
                    onChange={(e) => setBatchJsonText(e.target.value)}
                    spellCheck={false}
                  />
                  <div className="flex justify-end gap-2 border-t border-ink-100 pt-2">
                    <button
                      type="button"
                      className={`${TOKENS.btn.base} ${TOKENS.btn.sub} !text-[10px]`}
                      onClick={() => setBatchImportOpen(false)}
                    >
                      取消
                    </button>
                    <button
                      type="button"
                      className={`${TOKENS.btn.base} ${TOKENS.btn.primary} !text-[10px] shadow-subtle`}
                      onClick={() => applyBatchJson(batchJsonText)}
                    >
                      套用
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          {caseCompareOpen ? (
            <div
              className="inheritance-no-print fixed inset-0 z-[86] flex items-center justify-center bg-ink-900/20 p-3"
              role="dialog"
              aria-modal="true"
              aria-labelledby="inh-compare-title"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setCaseCompareOpen(false);
              }}
            >
              <div className="flex max-h-[min(90vh,520px)] w-full max-w-xl flex-col border border-ink-100 bg-surface shadow-subtle rounded-sm">
                <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-3 py-2">
                  <h2 id="inh-compare-title" className="text-[11px] font-bold uppercase tracking-widest text-ink-900">
                    與個案當事人比對
                  </h2>
                  <button
                    type="button"
                    className="text-ink-400 hover:text-accent transition-colors p-1"
                    aria-label="關閉"
                    onClick={() => setCaseCompareOpen(false)}
                  >
                    <i className="ph ph-x text-sm" />
                  </button>
                </div>
                <div className="flex flex-col gap-2 px-3 py-3">
                  <p className="text-[10px] leading-relaxed text-ink-600">
                    貼上 JSON 陣列，每列含 casePartyId、name（與個案主檔一致）。圖中人物須已填「個案當事人鍵」。
                  </p>
                  <textarea
                    className={`${TOKENS.input} min-h-[6rem] w-full resize-y font-mono text-[11px]`}
                    value={caseCompareText}
                    onChange={(e) => setCaseCompareText(e.target.value)}
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className={`${TOKENS.btn.base} ${TOKENS.btn.primary} !text-[10px] self-start shadow-subtle`}
                    onClick={runCaseCompare}
                  >
                    執行比對
                  </button>
                  {caseCompareResult ? (
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap border border-ink-100 bg-panel px-2 py-1.5 text-[10px] text-ink-900 font-mono leading-snug">
                      {caseCompareResult}
                    </pre>
                  ) : null}
                  <div className="flex justify-end border-t border-ink-100 pt-2">
                    <button
                      type="button"
                      className={`${TOKENS.btn.base} ${TOKENS.btn.sub} !text-[10px]`}
                      onClick={() => setCaseCompareOpen(false)}
                    >
                      關閉
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </main>

        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #inheritance-chart-root .print-area,
            #inheritance-chart-root .print-area * { visibility: visible !important; }
            #inheritance-chart-root {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
            }
            .inheritance-no-print { display: none !important; }
            .inheritance-canvas-root {
              width: 210mm !important;
              min-height: 280mm !important;
              max-width: none !important;
              margin: 0 auto !important;
              border: none !important;
              box-shadow: none !important;
              background: #fff !important;
            }
          }
        `}</style>
      </div>
    );
  }

  if (typeof globalThis !== 'undefined') {
    globalThis.JCMSInheritanceModelAdapter = {
      SCHEMA_VERSION,
      serializeModel,
      buildMdFile,
      parseLoadedMd,
      normalizeParentEdge,
      validateBatchInheritancePayload,
    };
  }

  let _jcmsInheritanceRoot = null;
  window.__jcmsUnmountInheritanceChart = function __jcmsUnmountInheritanceChart() {
    if (_jcmsInheritanceRoot) {
      try {
        _jcmsInheritanceRoot.unmount();
      } catch (e) {
        /* noop */
      }
      _jcmsInheritanceRoot = null;
    }
  };

  window.__jcmsMountInheritanceChart = function __jcmsMountInheritanceChart() {
    const el = document.getElementById('inheritance-chart-root');
    if (!el) return;
    window.__jcmsUnmountInheritanceChart();
    _jcmsInheritanceRoot = ReactDOM.createRoot(el);
    _jcmsInheritanceRoot.render(<InheritanceChartApp />);
  };
})();
