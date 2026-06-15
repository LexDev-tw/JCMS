/**
 * 繼承系統表 — 法定繼承資格判定（純函式，供 UI 與 Node fixture 共用）
 */
(function (global) {
  function parseRocInput(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    if (s.includes('.')) {
      const m = s.match(/^(-?)(\d{1,4})\.(\d{2})\.(\d{2})$/);
      if (!m) return null;
      const beforeRoc = m[1] === '-';
      const y = Number(m[2]);
      const mo = Number(m[3]);
      const d = Number(m[4]);
      if (beforeRoc) return { beforeRoc: true, rocBeforeYear: y, mo, d };
      return { y, mo, d };
    }
    const beforeRoc = s.startsWith('-');
    const digitSrc = beforeRoc ? s.slice(1) : s;
    const digits = digitSrc.replace(/\D/g, '');
    if (digits.length < 6 || digits.length > 8) return null;
    const splitIdx = digits.length === 6 ? 2 : digits.length === 7 ? 3 : 4;
    const yNum = Number(digits.slice(0, splitIdx));
    const mo = Number(digits.slice(splitIdx, splitIdx + 2));
    const d = Number(digits.slice(splitIdx + 2, splitIdx + 4));
    if (beforeRoc) return { beforeRoc: true, rocBeforeYear: yNum, mo, d };
    return { y: yNum, mo, d };
  }

  function rocToDate(rocStr) {
    const p = parseRocInput(rocStr);
    if (!p || p.mo < 1 || p.mo > 12 || p.d < 1 || p.d > 31) return null;
    let adYear;
    if (p.beforeRoc) {
      if (p.rocBeforeYear < 1) return null;
      adYear = 1912 - p.rocBeforeYear;
      if (adYear < 1 || adYear >= 1912) return null;
    } else {
      adYear = p.y >= 1911 ? p.y : p.y + 1911;
    }
    const t = new Date(adYear, p.mo - 1, p.d);
    return t.getFullYear() === adYear && t.getMonth() === p.mo - 1 && t.getDate() === p.d ? t : null;
  }

  function getChildren(parentId, parentEdges) {
    return parentEdges.filter((e) => e.parentId === parentId).map((e) => e.childId);
  }

  function getParents(childId, parentEdges) {
    return parentEdges.filter((e) => e.childId === childId).map((e) => e.parentId);
  }

  function getDescendants(rootId, parentEdges) {
    const out = new Set();
    const q = [rootId];
    while (q.length) {
      const id = q.shift();
      for (const c of getChildren(id, parentEdges)) {
        if (!out.has(c)) {
          out.add(c);
          q.push(c);
        }
      }
    }
    return out;
  }

  function spouseBond(sp) {
    return sp && sp.bond === 'divorced' ? 'divorced' : 'married';
  }

  function forEachMarriedSpousePartner(decedentId, spousePairs, fn) {
    spousePairs.forEach((sp) => {
      if (sp.aId !== decedentId && sp.bId !== decedentId) return;
      if (spouseBond(sp) !== 'married') return;
      const sid = sp.aId === decedentId ? sp.bId : sp.aId;
      fn(sid, sp);
    });
  }

  function survivedOpening(person, openingDate) {
    if (!openingDate) return null;
    if (!person.deathDate || !String(person.deathDate).trim()) return true;
    const d = rocToDate(person.deathDate);
    if (!d) return null;
    return d > openingDate;
  }

  function diedBeforeOpening(person, openingDate) {
    if (!openingDate) return false;
    if (!person.deathDate || !String(person.deathDate).trim()) return false;
    const d = rocToDate(person.deathDate);
    if (!d) return false;
    return d < openingDate;
  }

  /**
   * 排除「已出養／終止收養」等不構成親子關係之邊（若未標示則視為血親／有效養親）。
   */
  function isEffectiveParentEdge(e) {
    if (!e || e.suppressed === true) return false;
    if (e.kind === 'adoptive' && e.adoptionTerminated) return false;
    return true;
  }

  function filterEffectiveEdges(parentEdges) {
    return parentEdges.filter(isEffectiveParentEdge);
  }

  /**
   * 法定繼承資格（不計應繼分）
   */
  function computeInheritance(model) {
    const parentEdges = filterEffectiveEdges(model.parentEdges || []);
    const { persons, decedentId, spousePairs } = model;
    const empty = { error: null, byId: {}, activeOrder: null, spouseHeir: false };
    if (!decedentId || !persons[decedentId]) {
      return { ...empty, error: '請設定被繼承人。' };
    }
    const decedent = persons[decedentId];
    const opening = rocToDate(decedent.deathDate);
    if (!opening) {
      return { ...empty, error: '請設定被繼承人死亡年月日作為繼承開始時點。' };
    }

    const byId = {};
    const mark = (id, payload) => {
      byId[id] = { ...(byId[id] || {}), ...payload };
    };

    Object.keys(persons).forEach((id) => {
      const p = persons[id];
      let status = 'not_heir';
      let note = '';
      if (id === decedentId) {
        status = 'decedent';
        note = '被繼承人';
      } else if (diedBeforeOpening(p, opening)) {
        status = 'predeceased';
        note = '先於被繼承人死亡';
      } else if (!survivedOpening(p, opening)) {
        status = 'unknown';
        note = '死亡日資料不明';
      }
      mark(id, { status, note, order: null, isSubstitute: false });
    });

    let activeOrder = null;
    let spouseIsHeir = false;

    const children = getChildren(decedentId, parentEdges);
    const order1Candidates = [];

    if (children.length) {
      const aliveChildren = children.filter((cid) => survivedOpening(persons[cid], opening));
      const deadChildren = children.filter((cid) => diedBeforeOpening(persons[cid], opening));
      if (aliveChildren.length) {
        aliveChildren.forEach((cid) => order1Candidates.push({ id: cid, isSubstitute: false }));
        deadChildren.forEach((cid) => {
          const gcs = getChildren(cid, parentEdges);
          gcs.forEach((gcid) => {
            if (survivedOpening(persons[gcid], opening)) {
              order1Candidates.push({ id: gcid, isSubstitute: true });
            }
          });
        });
      } else {
        deadChildren.forEach((cid) => {
          const gcs = getChildren(cid, parentEdges);
          gcs.forEach((gcid) => {
            if (survivedOpening(persons[gcid], opening)) {
              order1Candidates.push({ id: gcid, isSubstitute: true });
            }
          });
        });
      }
    }

    if (!order1Candidates.length) {
      const desc = getDescendants(decedentId, parentEdges);
      desc.delete(decedentId);
      const descArr = [...desc];
      const depthMemo = new Map();
      function depthFromDecedent(pid) {
        if (depthMemo.has(pid)) return depthMemo.get(pid);
        const q = [[decedentId, 0]];
        const seen = new Set([decedentId]);
        while (q.length) {
          const [nid, d] = q.shift();
          if (nid === pid) {
            depthMemo.set(pid, d);
            return d;
          }
          for (const c of getChildren(nid, parentEdges)) {
            if (!seen.has(c)) {
              seen.add(c);
              q.push([c, d + 1]);
            }
          }
        }
        return null;
      }
      const candidates = descArr
        .map((id) => ({ id, depth: depthFromDecedent(id) }))
        .filter((x) => x.depth != null && x.depth >= 1)
        .sort((a, b) => a.depth - b.depth);
      const minD = candidates.length ? candidates[0].depth : null;
      if (minD != null) {
        const layer = candidates.filter((c) => c.depth === minD);
        for (const { id } of layer) {
          const p = persons[id];
          if (!survivedOpening(p, opening)) continue;
          const parList = getParents(id, parentEdges);
          const parent = parList[0] ? persons[parList[0]] : null;
          const sub =
            parent && desc.has(parList[0]) && diedBeforeOpening(parent, opening);
          order1Candidates.push({ id, isSubstitute: Boolean(sub) });
        }
      }
    }

    const uniq1 = [];
    const seen1 = new Set();
    order1Candidates.forEach((x) => {
      if (!seen1.has(x.id)) {
        seen1.add(x.id);
        uniq1.push(x);
      }
    });

    if (uniq1.length) {
      activeOrder = 1;
      uniq1.forEach(({ id, isSubstitute }) => {
        mark(id, {
          status: 'heir',
          order: 1,
          isSubstitute,
          note: isSubstitute ? '繼承（代位）' : '繼承',
        });
      });
      forEachMarriedSpousePartner(decedentId, spousePairs, (sid) => {
        if (!persons[sid] || !survivedOpening(persons[sid], opening)) return;
        spouseIsHeir = true;
        mark(sid, { status: 'spouse_heir', order: 1, note: '配偶共同繼承' });
      });
    } else {
      const parents = getParents(decedentId, parentEdges);
      const order2 = parents.filter((pid) => survivedOpening(persons[pid], opening));
      if (order2.length) {
        activeOrder = 2;
        order2.forEach((pid) => mark(pid, { status: 'heir', order: 2, note: '繼承（第二順位）' }));
        forEachMarriedSpousePartner(decedentId, spousePairs, (sid) => {
          if (!persons[sid] || !survivedOpening(persons[sid], opening)) return;
          spouseIsHeir = true;
          mark(sid, { status: 'spouse_heir', order: 2, note: '配偶共同繼承' });
        });
      } else {
        const decParents = getParents(decedentId, parentEdges);
        const decParentSet = new Set(decParents);
        const childIds = new Set(getChildren(decedentId, parentEdges));
        const siblings =
          decParents.length === 0
            ? []
            : Object.keys(persons).filter((pid) => {
                if (pid === decedentId) return false;
                if (childIds.has(pid)) return false;
                if (decParentSet.has(pid)) return false;
                const pp = getParents(pid, parentEdges);
                return pp.some((x) => decParentSet.has(x));
              });
        const siblingHeirs = siblings.filter((sid) => survivedOpening(persons[sid], opening));
        if (siblingHeirs.length) {
          activeOrder = 3;
          siblingHeirs.forEach((sid) => mark(sid, { status: 'heir', order: 3, note: '繼承（第三順位）' }));
          forEachMarriedSpousePartner(decedentId, spousePairs, (sid) => {
            if (!persons[sid] || !survivedOpening(persons[sid], opening)) return;
            spouseIsHeir = true;
            mark(sid, { status: 'spouse_heir', order: 3, note: '配偶共同繼承' });
          });
        } else {
          const gpIds = new Set();
          parents.forEach((ppid) => {
            getParents(ppid, parentEdges).forEach((g) => gpIds.add(g));
          });
          const order4 = [...gpIds].filter((gid) => survivedOpening(persons[gid], opening));
          if (order4.length) {
            activeOrder = 4;
            order4.forEach((gid) => mark(gid, { status: 'heir', order: 4, note: '繼承（第四順位）' }));
            forEachMarriedSpousePartner(decedentId, spousePairs, (sid) => {
              if (!persons[sid] || !survivedOpening(persons[sid], opening)) return;
              spouseIsHeir = true;
              mark(sid, { status: 'spouse_heir', order: 4, note: '配偶共同繼承' });
            });
          } else {
            let spOnly = false;
            forEachMarriedSpousePartner(decedentId, spousePairs, (sid) => {
              if (!persons[sid] || !survivedOpening(persons[sid], opening)) return;
              spOnly = true;
              spouseIsHeir = true;
              mark(sid, { status: 'spouse_heir', order: 'spouse_only', note: '配偶繼承' });
            });
            if (spOnly) activeOrder = 'spouse_only';
          }
        }
      }
    }

    Object.keys(persons).forEach((id) => {
      if (id === decedentId) return;
      const cur = byId[id];
      if (cur && cur.status === 'not_heir' && survivedOpening(persons[id], opening)) {
        const des = getDescendants(decedentId, parentEdges);
        if (des.has(id) && activeOrder && activeOrder !== 1) {
          mark(id, { status: 'not_heir', note: '非繼承人（後順位不適用）' });
        } else if (des.has(id) && activeOrder === 1 && !uniq1.some((u) => u.id === id)) {
          mark(id, { status: 'not_heir', note: '非繼承人（親等遠或其他原因）' });
        }
      }
    });

    return {
      error: null,
      byId,
      activeOrder,
      spouseHeir: spouseIsHeir,
      opening,
    };
  }

  const api = {
    parseRocInput,
    rocToDate,
    getChildren,
    getParents,
    getDescendants,
    spouseBond,
    computeInheritance,
    filterEffectiveEdges,
  };

  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  g.JCMSInheritanceCompute = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
