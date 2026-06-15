/**
 * 繼承系統表 — 家系圖自動排版（與 React 解耦）
 * Architecture：親等深度 → 底層同胞分群 → 由下往上雙親／配偶對齊 → 列內等距 pack。
 * 錨點幾何：節點寬高為 GEN_NODE_W × GEN_NODE_H（與畫布方塊一致）。
 */
(function (global) {
  const GEN_NODE_W = 136;
  const GEN_NODE_H = 88;
  const MARGIN_X = 72;
  const MARGIN_Y = 52;
  const LEVEL_GAP = 72;
  const SIB_GAP = 28;
  const CLUSTER_GAP = 28;
  const SPOUSE_GAP = 48;

  function getChildren(parentId, parentEdges) {
    return parentEdges.filter((e) => e.parentId === parentId).map((e) => e.childId);
  }

  function getParents(childId, parentEdges) {
    return parentEdges.filter((e) => e.childId === childId).map((e) => e.parentId);
  }

  function birthOrderSortKey(p) {
    const raw = String(p.birthOrder || '').trim();
    if (!raw) return '';
    const n = Number(raw);
    if (Number.isFinite(n) && String(n) === raw) return String(1e6 + n).padStart(12, '0');
    return raw;
  }

  function birthCmp(persons, a, b) {
    const ka = birthOrderSortKey(persons[a]);
    const kb = birthOrderSortKey(persons[b]);
    if (ka !== kb) return ka.localeCompare(kb, 'zh-Hant', { numeric: true });
    return (persons[a].name || '').localeCompare(persons[b].name || '', 'zh-Hant');
  }

  /** 同世代列 y（與 layoutGenealogyPositions 內 yFor 一致） */
  function layerYForDepth(depth) {
    return MARGIN_Y + depth * (GEN_NODE_H + LEVEL_GAP);
  }

  /**
   * 配偶應與對方同一世代列：僅依親子邊計算時，無親屬邊之配偶會變成 depth 0，與已有雙親之被繼承人（depth≥1）錯層，
   * 導致配偶被排到上一列、連線 y 取兩點中點而看似斷線。將每對配偶深度統一為 max(雙方)。
   */
  function alignSpouseDepths(depths, persons, spousePairs) {
    const n = Object.keys(persons).length;
    const cap = Math.max(4, n + 2);
    for (let i = 0; i < cap; i++) {
      let changed = false;
      spousePairs.forEach((sp) => {
        const aId = sp.aId;
        const bId = sp.bId;
        if (!persons[aId] || !persons[bId]) return;
        const m = Math.max(depths[aId] ?? 0, depths[bId] ?? 0);
        if (depths[aId] !== m) {
          depths[aId] = m;
          changed = true;
        }
        if (depths[bId] !== m) {
          depths[bId] = m;
          changed = true;
        }
      });
      if (!changed) break;
    }
  }

  /**
   * 強制每人 y 對齊該親等之標準列高，避免任一分支出錯造成同層配偶／同胞 y 不一致而斷線。
   */
  function snapAllNodesToCanonicalY(pos, depths, persons, yFor) {
    Object.keys(persons).forEach((id) => {
      const p = pos[id];
      if (!p) return;
      const d = depths[id];
      if (d === undefined) return;
      const yy = yFor(d);
      if (p.y !== yy) pos[id] = { x: p.x, y: yy };
    });
  }

  /**
   * 與 layoutGenealogyPositions 相同之深度演算法（循環時該節點 depth=0）。
   * @returns {Record<string, number>}
   */
  function computeDepthMap(persons, parentEdges) {
    const ids = Object.keys(persons);
    const depths = {};
    function computeDepth(id, stack) {
      if (depths[id] !== undefined) return depths[id];
      const pars = getParents(id, parentEdges).filter((p) => persons[p]);
      if (!pars.length) {
        depths[id] = 0;
        return 0;
      }
      if (stack && stack.has(id)) {
        depths[id] = 0;
        return 0;
      }
      const st = stack || new Set();
      st.add(id);
      let d = 0;
      for (const p of pars) {
        d = Math.max(d, computeDepth(p, st) + 1);
      }
      st.delete(id);
      depths[id] = d;
      return d;
    }
    ids.forEach((id) => computeDepth(id));
    return depths;
  }

  function packRowsEqualHorizontal(pos, depths, byDepth, dMax, yFor, persons, spousePairs) {
    const H_GAP = 28;
    const SP_INNER = 48;
    for (let d = 0; d <= dMax; d++) {
      const rowIds = (byDepth[d] || []).filter((id) => pos[id]).sort((a, b) => pos[a].x - pos[b].x);
      const y = yFor(d);
      let x = MARGIN_X;
      const used = new Set();
      const spouseAtSameDepth = (id) => {
        for (let i = 0; i < spousePairs.length; i++) {
          const sp = spousePairs[i];
          if (!persons[sp.aId] || !persons[sp.bId]) continue;
          if (depths[sp.aId] !== d || depths[sp.bId] !== d) continue;
          if (sp.aId === id) return sp.bId;
          if (sp.bId === id) return sp.aId;
        }
        return null;
      };
      for (let i = 0; i < rowIds.length; i++) {
        const id = rowIds[i];
        if (used.has(id)) continue;
        const sp = spouseAtSameDepth(id);
        if (sp && rowIds.includes(sp) && !used.has(sp)) {
          const left = pos[id].x <= pos[sp].x ? id : sp;
          const right = left === id ? sp : id;
          pos[left] = { x, y };
          pos[right] = { x: x + GEN_NODE_W + SP_INNER, y };
          used.add(left);
          used.add(right);
          x += GEN_NODE_W * 2 + SP_INNER + H_GAP;
        } else {
          pos[id] = { x, y };
          used.add(id);
          x += GEN_NODE_W + H_GAP;
        }
      }
    }
  }

  function alignParentsOverChildrenLayout(pos, depths, byDepth, dMax, yFor, persons, parentEdges, spousePairs) {
    const SP_INNER = 48;
    const pairedAtDepth = new Set();
    for (let d = dMax - 1; d >= 0; d--) {
      spousePairs.forEach((sp) => {
        const aId = sp.aId;
        const bId = sp.bId;
        if (!persons[aId] || !persons[bId]) return;
        if (depths[aId] !== d || depths[bId] !== d) return;
        const sharedKids = getChildren(aId, parentEdges).filter((c) => getParents(c, parentEdges).includes(bId));
        const kidsPos = sharedKids.filter((c) => pos[c]);
        if (!kidsPos.length) return;
        const minX = Math.min(...kidsPos.map((c) => pos[c].x));
        const maxX = Math.max(...kidsPos.map((c) => pos[c].x + GEN_NODE_W));
        const centerX = (minX + maxX) / 2;
        const coupleW = GEN_NODE_W * 2 + SP_INNER;
        const leftId = pos[aId].x <= pos[bId].x ? aId : bId;
        const rightId = leftId === aId ? bId : aId;
        const leftX = Math.round(centerX - coupleW / 2);
        const yy = yFor(d);
        pos[leftId] = { x: leftX, y: yy };
        pos[rightId] = { x: leftX + GEN_NODE_W + SP_INNER, y: yy };
        pairedAtDepth.add(`${d}:${leftId}`);
        pairedAtDepth.add(`${d}:${rightId}`);
      });

      (byDepth[d] || []).forEach((pid) => {
        if (!persons[pid] || !pos[pid]) return;
        if (pairedAtDepth.has(`${d}:${pid}`)) return;
        const kids = getChildren(pid, parentEdges).filter((c) => pos[c]);
        if (!kids.length) return;
        const minX = Math.min(...kids.map((c) => pos[c].x));
        const maxX = Math.max(...kids.map((c) => pos[c].x + GEN_NODE_W));
        const centerX = (minX + maxX) / 2;
        pos[pid] = { x: Math.round(centerX - GEN_NODE_W / 2), y: yFor(d) };
      });
    }
  }

  function layoutGenealogyPositions(persons, parentEdges, spousePairs) {
    const ids = Object.keys(persons);
    if (!ids.length) return {};

    const depths = computeDepthMap(persons, parentEdges);
    alignSpouseDepths(depths, persons, spousePairs);
    const dMax = Math.max(0, ...ids.map((id) => depths[id]));
    const yFor = (depth) => layerYForDepth(depth);

    const pos = {};
    const byDepth = {};
    ids.forEach((id) => {
      const dd = depths[id];
      if (!byDepth[dd]) byDepth[dd] = [];
      byDepth[dd].push(id);
    });

    function siblingKey(childId) {
      return getParents(childId, parentEdges)
        .filter((p) => persons[p])
        .slice()
        .sort()
        .join('|');
    }

    let cursorX = MARGIN_X;
    const atMax = byDepth[dMax] || [];
    const groups = new Map();
    atMax.forEach((id) => {
      const k = siblingKey(id);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(id);
    });

    const sortedKeys = Array.from(groups.keys()).sort((ka, kb) => {
      const fa = groups.get(ka).slice().sort((a, b) => birthCmp(persons, a, b))[0] || '';
      const fb = groups.get(kb).slice().sort((a, b) => birthCmp(persons, a, b))[0] || '';
      return fa.localeCompare(fb);
    });

    sortedKeys.forEach((k) => {
      const members = groups.get(k).slice().sort((a, b) => birthCmp(persons, a, b));
      members.forEach((id) => {
        pos[id] = { x: cursorX, y: yFor(dMax) };
        cursorX += GEN_NODE_W + SIB_GAP;
      });
      cursorX += CLUSTER_GAP;
    });

    spousePairs.forEach((sp) => {
      const aId = sp.aId;
      const bId = sp.bId;
      if (!persons[aId] || !persons[bId]) return;
      if (depths[aId] !== dMax || depths[bId] !== dMax) return;
      const sharedKids = getChildren(aId, parentEdges).filter((c) => getParents(c, parentEdges).includes(bId));
      if (sharedKids.length) return;
      const leftId = aId < bId ? aId : bId;
      const rightId = aId < bId ? bId : aId;
      if (pos[leftId] && !pos[rightId]) {
        pos[rightId] = { x: pos[leftId].x + GEN_NODE_W + SPOUSE_GAP, y: pos[leftId].y };
      } else if (!pos[leftId] && pos[rightId]) {
        pos[leftId] = { x: pos[rightId].x - GEN_NODE_W - SPOUSE_GAP, y: pos[rightId].y };
      } else if (pos[leftId] && pos[rightId]) {
        pos[rightId] = { x: pos[leftId].x + GEN_NODE_W + SPOUSE_GAP, y: pos[leftId].y };
      }
    });

    for (let d = dMax - 1; d >= 0; d--) {
      const atLevel = byDepth[d] || [];
      const placedPair = new Set();

      spousePairs.forEach((sp) => {
        const aId = sp.aId;
        const bId = sp.bId;
        if (!persons[aId] || !persons[bId]) return;
        if (depths[aId] !== d || depths[bId] !== d) return;
        const pk = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
        if (placedPair.has(pk)) return;

        const sharedKids = getChildren(aId, parentEdges).filter((c) => getParents(c, parentEdges).includes(bId));
        const kidsPos = sharedKids.filter((c) => pos[c]);

        const leftId = aId < bId ? aId : bId;
        const rightId = aId < bId ? bId : aId;

        if (kidsPos.length) {
          const minX = Math.min(...kidsPos.map((c) => pos[c].x));
          const maxX = Math.max(...kidsPos.map((c) => pos[c].x + GEN_NODE_W));
          const centerX = (minX + maxX) / 2;

          const coupleW = GEN_NODE_W * 2 + SPOUSE_GAP;

          if (!pos[leftId] && !pos[rightId]) {
            const leftX = Math.round(centerX - coupleW / 2);
            pos[leftId] = { x: leftX, y: yFor(d) };
            pos[rightId] = { x: leftX + GEN_NODE_W + SPOUSE_GAP, y: yFor(d) };
          } else if (pos[leftId] && !pos[rightId]) {
            pos[rightId] = { x: pos[leftId].x + GEN_NODE_W + SPOUSE_GAP, y: yFor(d) };
          } else if (!pos[leftId] && pos[rightId]) {
            pos[leftId] = { x: pos[rightId].x - GEN_NODE_W - SPOUSE_GAP, y: yFor(d) };
          }
        } else {
          if (!pos[leftId] && !pos[rightId]) {
            pos[leftId] = { x: cursorX, y: yFor(d) };
            pos[rightId] = { x: cursorX + GEN_NODE_W + SPOUSE_GAP, y: yFor(d) };
            cursorX += GEN_NODE_W * 2 + SPOUSE_GAP + CLUSTER_GAP;
          } else if (pos[leftId] && !pos[rightId]) {
            pos[rightId] = { x: pos[leftId].x + GEN_NODE_W + SPOUSE_GAP, y: pos[leftId].y };
          } else if (!pos[leftId] && pos[rightId]) {
            pos[leftId] = { x: pos[rightId].x - GEN_NODE_W - SPOUSE_GAP, y: pos[rightId].y };
          } else {
            pos[rightId] = { x: pos[leftId].x + GEN_NODE_W + SPOUSE_GAP, y: pos[leftId].y };
          }
        }

        placedPair.add(pk);
      });

      atLevel.forEach((pid) => {
        if (pos[pid]) return;
        const kids = getChildren(pid, parentEdges).filter((c) => pos[c]);
        if (kids.length) {
          const minX = Math.min(...kids.map((c) => pos[c].x));
          const maxX = Math.max(...kids.map((c) => pos[c].x + GEN_NODE_W));
          const centerX = (minX + maxX) / 2;
          pos[pid] = { x: Math.round(centerX - GEN_NODE_W / 2), y: yFor(d) };
        }
      });

      let orphanX = cursorX;
      atLevel.forEach((pid) => {
        if (pos[pid]) return;
        pos[pid] = { x: orphanX, y: yFor(d) };
        orphanX += GEN_NODE_W + CLUSTER_GAP;
      });
      cursorX = Math.max(cursorX, orphanX);
    }

    packRowsEqualHorizontal(pos, depths, byDepth, dMax, yFor, persons, spousePairs);
    alignParentsOverChildrenLayout(pos, depths, byDepth, dMax, yFor, persons, parentEdges, spousePairs);
    snapAllNodesToCanonicalY(pos, depths, persons, yFor);

    return pos;
  }

  /** 拖曳 pin：保留橫向 x；縱向 y 永遠跟隨本次排版之親等列，拓樸變更後仍同代同層、線段不錯層。 */
  function mergeLayoutKeepingPins(prevPositions, laidPositions, pinnedIds) {
    const out = {};
    Object.keys(laidPositions).forEach((id) => {
      const laid = laidPositions[id];
      if (!laid) return;
      const prev = prevPositions[id];
      if (pinnedIds.has(id) && prev && typeof prev.x === 'number' && typeof laid.y === 'number') {
        out[id] = { x: prev.x, y: laid.y };
      } else {
        out[id] = laid;
      }
    });
    return out;
  }

  const g = typeof globalThis !== 'undefined' ? globalThis : {};
  g.JCMSGenealogyLayout = {
    GEN_NODE_W,
    GEN_NODE_H,
    MARGIN_Y,
    LEVEL_GAP,
    layerYForDepth,
    computeDepthMap,
    alignSpouseDepths,
    layoutGenealogyPositions,
    mergeLayoutKeepingPins,
    _internals: { getChildren, getParents },
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = g.JCMSGenealogyLayout;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
