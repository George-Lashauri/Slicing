const INITIAL_ROWS = 5, CUT_SPACING = 3;
let placements = [];

function createCutRow(n) {
    const tr = document.createElement('tr');
    tr.className = 'cut-row';
    tr.innerHTML = `<td class="cut-number">${n}</td><td><input type="number" class="cut-width" placeholder="e.g., 1000" min="1"></td><td><input type="number" class="cut-height" placeholder="e.g., 500" min="1"></td><td><input type="number" class="cut-quantity" placeholder="1" min="1" value="1"></td>`;
    tr.querySelectorAll('input').forEach(i => i.addEventListener('paste', handlePaste));
    return tr;
}

function initializePasteHandlers() {
    document.querySelectorAll('.cut-row input').forEach(i => i.addEventListener('paste', handlePaste));
}

function handlePaste(e) {
    e.preventDefault();
    const data = e.clipboardData.getData('text/plain').trim().split('\n').flatMap(l => l.trim().split(/\s+|,\s*/)).filter(v => v);
    if (!data.length) return;
    
    let inputs = Array.from(document.querySelectorAll('.cuts-table input'));
    const start = inputs.indexOf(e.target);
    const tbody = document.getElementById('cutsList');
    const rows = document.querySelectorAll('.cut-row').length;
    const needed = Math.ceil(data.length / 3);
    
    if (needed > rows) {
        for (let i = rows + 1; i <= needed; i++) tbody.appendChild(createCutRow(i));
        inputs = Array.from(document.querySelectorAll('.cuts-table input'));
    }
    
    data.forEach((v, i) => {
        if (inputs[start + i]) {
            inputs[start + i].value = v;
            inputs[start + i].dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
}

function resetForm() {
    document.querySelectorAll('.cuts-table input').forEach(i => i.value = '');
    const rows = document.querySelectorAll('.cut-row');
    if (rows.length > INITIAL_ROWS) {
        for (let i = rows.length - 1; i >= INITIAL_ROWS; i--) rows[i].remove();
    }
    document.getElementById('numBoards').value = '1';
}

function getCutItems() {
    const cuts = [];
    document.querySelectorAll('.cut-row').forEach(row => {
        const w = parseInt(row.querySelector('.cut-width').value) || 0;
        const h = parseInt(row.querySelector('.cut-height').value) || 0;
        const q = parseInt(row.querySelector('.cut-quantity').value) || 0;
        if (w > 0 && h > 0 && q > 0) {
            for (let i = 0; i < q; i++) cuts.push({ width: w, height: h, id: cuts.length });
        }
    });
    return cuts;
}

function packMultipleBoards(bw, bh, nb, rects) {
    const ap = [];
    let rem = [...rects];
    const fb = Math.floor(nb);
    const pb = nb % 1 !== 0;
    
    for (let bi = 0; bi < fb; bi++) {
        const bp = packRectangles(bw, bh, rem);
        const s = bp.filter(p => !p.failed);
        const f = bp.filter(p => p.failed);
        s.forEach(p => ap.push({ ...p, boardNumber: bi + 1 }));
        rem = f.map(x => ({ width: x.width, height: x.height, id: x.id, originalId: x.originalId }));
    }
    
    if (pb && rem.length > 0) {
        const ph = Math.floor(bh / 2);
        const bp = packRectangles(bw, ph, rem);
        const s = bp.filter(p => !p.failed);
        const f = bp.filter(p => p.failed);
        s.forEach(p => ap.push({ ...p, boardNumber: fb + 1, isPartial: true }));
        f.forEach(x => ap.push({ ...x, boardNumber: fb + 1, failed: true }));
    } else if (rem.length > 0) {
        rem.forEach(r => ap.push({ x: -1, y: -1, width: r.width, height: r.height, id: r.id, originalId: r.originalId, failed: true }));
    }
    return ap;
}

// 2D Bin Packing - Guillotine Heuristic
function packRectangles(bw, bh, rects) {
    const p = [];
    for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        let placed = false;
        for (const o of [{ w: r.width, h: r.height }, { w: r.height, h: r.width }]) {
            if (placed) break;
            for (const s of getFreeSpaces(bw, bh, p)) {
                if (placed) break;
                if (o.w <= s.width && o.h <= s.height) {
                    p.push({ x: s.x, y: s.y, width: o.w, height: o.h, id: r.id, originalId: i, rotated: o.w !== r.width });
                    placed = true;
                }
            }
        }
        if (!placed) p.push({ x: -1, y: -1, width: r.width, height: r.height, id: r.id, originalId: i, failed: true });
    }
    return p;
}

// Get free spaces
function getFreeSpaces(bw, bh, p) {
    const s = [];
    if (p.length === 0) return [{ x: 0, y: 0, width: bw, height: bh }];
    
    const ur = p.filter(x => !x.failed);
    const pos = new Set(['0,0']);
    ur.forEach(r => {
        pos.add(`${r.x + r.width + CUT_SPACING},${r.y}`);
        pos.add(`${r.x},${r.y + r.height + CUT_SPACING}`);
    });
    
    for (const pos_str of pos) {
        const [x, y] = pos_str.split(',').map(Number);
        if (x >= 0 && y >= 0 && x < bw && y < bh) {
            const w = bw - x, h = bh - y;
            if (w > 0 && h > 0 && !isOverlapping(x, y, w, h, ur)) {
                s.push({ x, y, width: w, height: h });
            }
        }
    }
    s.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    return s;
}



// Check overlap with spacing
function isOverlapping(x, y, w, h, rects) {
    return rects.some(r => {
        const l = r.x - CUT_SPACING, rr = r.x + r.width + CUT_SPACING, t = r.y - CUT_SPACING, b = r.y + r.height + CUT_SPACING;
        return !(x + w <= l || x >= rr || y + h <= t || y >= b);
    });
}

// Calculate and draw
function calculateCutting() {
    const bw = parseInt(document.getElementById('boardWidth').value);
    const bh = parseInt(document.getElementById('boardHeight').value);
    const nb = parseFloat(document.getElementById('numBoards').value);
    const cuts = getCutItems();
    
    if (!bw || !bh) return alert('Please enter board dimensions');
    if (nb <= 0) return alert('Please enter a valid number of boards (minimum 0.5)');
    if (cuts.length === 0) return alert('Please add at least one cut piece');
    
    placements = packMultipleBoards(bw, bh, nb, cuts);
    drawBoardLayout(bw, bh, placements, nb);
}

// Draw board layout
function drawBoardLayout(bw, bh, p, nb) {
    const c = document.getElementById('boardCanvas'), ctx = c.getContext('2d');
    const cw = c.width, ch = c.height;
    const bn = new Set(p.filter(x => !x.failed).map(x => x.boardNumber));
    const nbs = Math.max(bn.size, Math.ceil(nb));
    const bpr = nbs <= 2 ? nbs : 2;
    const br = Math.ceil(nbs / bpr);
    const aw = cw / bpr, ah = ch / br;
    const scale = Math.min(aw / bw, ah / bh) * 0.85;
    
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, cw, ch);
    
    for (let bi = 1; bi <= nbs; bi++) {
        const r = Math.floor((bi - 1) / bpr), col = (bi - 1) % bpr;
        const ox = col * aw + (aw - bw * scale) / 2, oy = r * ah + 30;
        drawSingleBoard(ctx, bw, bh, scale, ox, oy, bi, p);
    }
}

// Draw single board
function drawSingleBoard(ctx, bw, bh, sc, ox, oy, bn, p) {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.strokeRect(ox, oy, bw * sc, bh * sc);
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Board #${bn}`, ox + 10, oy - 8);
    ctx.fillStyle = '#6b7280';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${bw}mm`, ox + (bw * sc) / 2, oy - 25);
    
    p.filter(x => x.boardNumber === bn && !x.failed).forEach(pl => {
        const x = ox + pl.x * sc, y = oy + pl.y * sc, w = pl.width * sc, h = pl.height * sc;
        ctx.fillStyle = '#f3f4f633';
        ctx.fillRect(x - CUT_SPACING * sc, y - CUT_SPACING * sc, w + 2 * CUT_SPACING * sc, h + 2 * CUT_SPACING * sc);
        ctx.fillStyle = '#10b98133';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        if (w > 40 && h > 30) {
            ctx.fillStyle = '#065f46';
            ctx.font = 'bold 10px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${pl.width}×${pl.height}`, x + w / 2, y + h / 2 - 6);
            ctx.font = '9px sans-serif';
            ctx.fillText(`#${pl.originalId + 1}`, x + w / 2, y + h / 2 + 6);
        }
    });
}

document.addEventListener('DOMContentLoaded', initializePasteHandlers);
