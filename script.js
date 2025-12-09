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
    displayFitMessage(placements);
    drawBoardLayout(bw, bh, placements, nb);
}

// Display comprehensive message about fit status
function displayFitMessage(placements) {
    const messageEl = document.getElementById('fitMessage');
    const failedPieces = placements.filter(p => p.failed);
    
    if (failedPieces.length > 0) {
        messageEl.className = 'fit-message error';
        
        // Group failed pieces by dimensions to show quantity
        const pieceGroups = {};
        failedPieces.forEach(fp => {
            const key = `${fp.width}×${fp.height}`;
            if (!pieceGroups[key]) {
                pieceGroups[key] = {
                    width: fp.width,
                    height: fp.height,
                    count: 0,
                    ids: []
                };
            }
            pieceGroups[key].count++;
            if (fp.originalId !== undefined) {
                pieceGroups[key].ids.push(fp.originalId + 1);
            }
        });
        
        // Build detailed message
        let messageHTML = `<strong>⚠️ Warning: ${failedPieces.length} cut piece(s) cannot be fitted onto the available board(s).</strong><br><br>`;
        messageHTML += '<strong>Unfitted Pieces Inventory:</strong><ul style="margin: 10px 0; padding-left: 20px;">';
        
        Object.values(pieceGroups).forEach(group => {
            const idsList = group.ids.length > 0 ? ` (IDs: ${group.ids.join(', ')})` : '';
            messageHTML += `<li><strong>${group.count}x</strong> piece(s) of size <strong>${group.width}mm × ${group.height}mm</strong>${idsList}</li>`;
        });
        
        messageHTML += '</ul>';
        messageHTML += '<em>These pieces are displayed in the dedicated "Unfitted Pieces" section below.</em>';
        
        messageEl.innerHTML = messageHTML;
    } else {
        messageEl.className = 'fit-message success';
        messageEl.innerHTML = '<strong>✓ Success:</strong> All cut pieces fit successfully in the available board(s)!';
    }
}

// Draw board layout
function drawBoardLayout(bw, bh, p, nb) {
    const c = document.getElementById('boardCanvas'), ctx = c.getContext('2d');
    const cw = c.width, ch = c.height;
    const failedPieces = p.filter(x => x.failed);
    const bn = new Set(p.filter(x => !x.failed).map(x => x.boardNumber));
    const nbs = Math.max(bn.size, Math.ceil(nb));
    
    // Always arrange boards in a single column
    const bpr = 1; // Single column layout
    const br = nbs;
    
    // Calculate available space for boards (leave space for failed pieces section)
    const hasFailedPieces = failedPieces.length > 0;
    const boardAreaHeight = hasFailedPieces ? ch * 0.65 : ch; // Reserve bottom 35% for failed pieces
    const aw = cw * 0.9; // Use 90% of canvas width for substantial size
    const boardSpacing = 60; // Spacing between boards
    const ah = (boardAreaHeight - (boardSpacing * (nbs - 1))) / nbs; // Distribute height evenly
    
    // Calculate scale for substantial size - use larger scale factor
    const scale = Math.min(aw / bw, ah / bh) * 0.95; // Increased from 0.85 to 0.95 for larger boards
    
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, cw, ch);
    
    // Draw all boards in a single column
    for (let bi = 1; bi <= nbs; bi++) {
        const ox = (cw - bw * scale) / 2; // Center horizontally
        const oy = (bi - 1) * (bh * scale + boardSpacing) + 40; // Stack vertically with spacing
        drawSingleBoard(ctx, bw, bh, scale, ox, oy, bi, p);
    }
    
    // Draw dedicated section for failed pieces
    if (hasFailedPieces) {
        drawFailedPiecesSection(ctx, bw, bh, p, nb, scale, cw, ch, boardAreaHeight);
    }
}

// Draw single board
function drawSingleBoard(ctx, bw, bh, sc, ox, oy, bn, p) {
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.strokeRect(ox, oy, bw * sc, bh * sc);
    
    // Draw board title with enhanced padding/background for visibility
    const titleText = `Board #${bn}`;
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    const titleMetrics = ctx.measureText(titleText);
    const titlePadding = 10;
    const titleHeight = 26;
    
    // Draw title background with border for better visibility
    ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
    ctx.fillRect(ox + 10 - titlePadding, oy - titleHeight - 2, titleMetrics.width + titlePadding * 2, titleHeight);
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox + 10 - titlePadding, oy - titleHeight - 2, titleMetrics.width + titlePadding * 2, titleHeight);
    
    // Draw title text
    ctx.fillStyle = '#1f2937';
    ctx.fillText(titleText, ox + 10, oy - 8);
    
    // Draw board dimensions with enhanced padding
    const dimText = `${bw}mm × ${bh}mm`;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    const dimMetrics = ctx.measureText(dimText);
    const dimPadding = 10;
    const dimHeight = 22;
    
    // Draw dimensions background with border
    ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
    ctx.fillRect(
        ox + (bw * sc) / 2 - dimMetrics.width / 2 - dimPadding, 
        oy - titleHeight - dimHeight - 6, 
        dimMetrics.width + dimPadding * 2, 
        dimHeight
    );
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
        ox + (bw * sc) / 2 - dimMetrics.width / 2 - dimPadding, 
        oy - titleHeight - dimHeight - 6, 
        dimMetrics.width + dimPadding * 2, 
        dimHeight
    );
    
    // Draw dimensions text
    ctx.fillStyle = '#6b7280';
    ctx.fillText(dimText, ox + (bw * sc) / 2, oy - titleHeight - 12);
    
    // Draw all pieces on the board
    p.filter(x => x.boardNumber === bn && !x.failed).forEach(pl => {
        const x = ox + pl.x * sc, y = oy + pl.y * sc, w = pl.width * sc, h = pl.height * sc;
        
        // Draw spacing area
        ctx.fillStyle = '#f3f4f633';
        ctx.fillRect(x - CUT_SPACING * sc, y - CUT_SPACING * sc, w + 2 * CUT_SPACING * sc, h + 2 * CUT_SPACING * sc);
        
        // Draw piece
        ctx.fillStyle = '#10b98133';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
        
        // Always show dimensions for ALL pieces, regardless of size
        const dimText = `${pl.width}mm × ${pl.height}mm`;
        const idText = `#${pl.originalId + 1}`;
        
        // Calculate text size based on piece size, but ensure minimum readability
        let fontSize = Math.max(10, Math.min(w, h) * 0.15); // Scale font with piece size, min 10px
        fontSize = Math.min(fontSize, 14); // Max 14px for consistency
        
        // Draw text background for visibility (padding)
        ctx.font = `bold ${fontSize}px sans-serif`;
        const dimMetrics = ctx.measureText(dimText);
        ctx.font = `${fontSize - 2}px sans-serif`;
        const idMetrics = ctx.measureText(idText);
        
        const textWidth = Math.max(dimMetrics.width, idMetrics.width);
        const textHeight = fontSize * 2 + 4;
        const padding = 6;
        
        // Draw background rectangle for text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillRect(
            x + w / 2 - textWidth / 2 - padding,
            y + h / 2 - textHeight / 2 - padding,
            textWidth + padding * 2,
            textHeight + padding * 2
        );
        
        // Draw border around text background
        ctx.strokeStyle = '#065f46';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            x + w / 2 - textWidth / 2 - padding,
            y + h / 2 - textHeight / 2 - padding,
            textWidth + padding * 2,
            textHeight + padding * 2
        );
        
        // Draw dimensions text
        ctx.fillStyle = '#065f46';
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dimText, x + w / 2, y + h / 2 - fontSize / 2 - 2);
        
        // Draw ID text
        ctx.font = `${fontSize - 2}px sans-serif`;
        ctx.fillText(idText, x + w / 2, y + h / 2 + fontSize / 2 + 2);
    });
}

// Draw dedicated section for failed pieces
function drawFailedPiecesSection(ctx, bw, bh, p, nb, scale, cw, ch, boardAreaHeight) {
    const failedPieces = p.filter(x => x.failed);
    if (failedPieces.length === 0) return;
    
    const sectionY = boardAreaHeight + 10;
    const sectionHeight = ch - sectionY - 10;
    const sectionPadding = 15;
    const sectionWidth = cw - (sectionPadding * 2);
    
    // Draw section background (blank/light area)
    ctx.fillStyle = '#fef2f2';
    ctx.fillRect(sectionPadding, sectionY, sectionWidth, sectionHeight);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(sectionPadding, sectionY, sectionWidth, sectionHeight);
    ctx.setLineDash([]);
    
    // Draw section title with background for visibility
    const titleText = 'Unfitted Pieces Inventory';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'left';
    const titleMetrics = ctx.measureText(titleText);
    const titlePadding = 10;
    
    // Draw title background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillRect(sectionPadding + 10 - titlePadding, sectionY + 10, titleMetrics.width + titlePadding * 2, 24);
    ctx.strokeStyle = '#7f1d1d';
    ctx.lineWidth = 2;
    ctx.strokeRect(sectionPadding + 10 - titlePadding, sectionY + 10, titleMetrics.width + titlePadding * 2, 24);
    
    // Draw title text
    ctx.fillStyle = '#7f1d1d';
    ctx.fillText(titleText, sectionPadding + 10, sectionY + 28);
    
    // Draw subtitle with count and background
    const subtitleText = `Total: ${failedPieces.length} piece(s) that cannot be fitted`;
    ctx.font = '13px sans-serif';
    const subtitleMetrics = ctx.measureText(subtitleText);
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fillRect(sectionPadding + 10 - titlePadding, sectionY + 38, subtitleMetrics.width + titlePadding * 2, 20);
    
    ctx.fillStyle = '#991b1b';
    ctx.fillText(subtitleText, sectionPadding + 10, sectionY + 52);
    
    // Calculate grid layout for pieces
    const pieceSpacing = 15;
    const maxPieceWidth = 120;
    const maxPieceHeight = 80;
    const piecesPerRow = Math.floor((sectionWidth - 20) / (maxPieceWidth + pieceSpacing));
    const rowsNeeded = Math.ceil(failedPieces.length / piecesPerRow);
    
    // Draw each failed piece in grid layout
    failedPieces.forEach((fp, idx) => {
        const row = Math.floor(idx / piecesPerRow);
        const col = idx % piecesPerRow;
        
        // Calculate piece dimensions maintaining aspect ratio
        const aspectRatio = fp.width / fp.height;
        let displayW = Math.min(fp.width * scale, maxPieceWidth);
        let displayH = Math.min(fp.height * scale, maxPieceHeight);
        
        if (aspectRatio > 1) {
            displayH = displayW / aspectRatio;
            if (displayH > maxPieceHeight) {
                displayH = maxPieceHeight;
                displayW = displayH * aspectRatio;
            }
        } else {
            displayW = displayH * aspectRatio;
            if (displayW > maxPieceWidth) {
                displayW = maxPieceWidth;
                displayH = displayW / aspectRatio;
            }
        }
        
        // Calculate position
        const startX = sectionPadding + 20;
        const startY = sectionY + 60;
        const x = startX + col * (maxPieceWidth + pieceSpacing) + (maxPieceWidth - displayW) / 2;
        const y = startY + row * (maxPieceHeight + pieceSpacing + 20) + (maxPieceHeight - displayH) / 2;
        
        // Draw piece background
        ctx.fillStyle = '#fee2e2';
        ctx.fillRect(x - 2, y - 2, displayW + 4, displayH + 4);
        
        // Draw piece outline
        ctx.fillStyle = '#ef444433';
        ctx.fillRect(x, y, displayW, displayH);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x, y, displayW, displayH);
        ctx.setLineDash([]);
        
        // Always draw dimensions with padding for visibility (for ALL pieces)
        const dimText = `${fp.width}mm × ${fp.height}mm`;
        const idText = fp.originalId !== undefined ? `ID: #${fp.originalId + 1}` : '';
        
        // Calculate font size based on piece size, ensure minimum readability
        let fontSize = Math.max(9, Math.min(displayW, displayH) * 0.12);
        fontSize = Math.min(fontSize, 12);
        
        // Measure text
        ctx.font = `bold ${fontSize}px sans-serif`;
        const dimMetrics = ctx.measureText(dimText);
        let idMetrics = { width: 0 };
        if (idText) {
            ctx.font = `${fontSize - 1}px sans-serif`;
            idMetrics = ctx.measureText(idText);
        }
        
        const textWidth = Math.max(dimMetrics.width, idMetrics.width);
        const textHeight = idText ? fontSize * 2 + 3 : fontSize + 2;
        const padding = 5;
        
        // Draw text background for visibility
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillRect(
            x + displayW / 2 - textWidth / 2 - padding,
            y + displayH / 2 - textHeight / 2 - padding,
            textWidth + padding * 2,
            textHeight + padding * 2
        );
        
        // Draw border around text background
        ctx.strokeStyle = '#7f1d1d';
        ctx.lineWidth = 1;
        ctx.strokeRect(
            x + displayW / 2 - textWidth / 2 - padding,
            y + displayH / 2 - textHeight / 2 - padding,
            textWidth + padding * 2,
            textHeight + padding * 2
        );
        
        // Draw dimensions text
        ctx.fillStyle = '#7f1d1d';
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(dimText, x + displayW / 2, y + displayH / 2 - (idText ? fontSize / 2 : 0));
        
        // Draw piece ID if available
        if (idText) {
            ctx.font = `${fontSize - 1}px sans-serif`;
            ctx.fillText(idText, x + displayW / 2, y + displayH / 2 + fontSize / 2 + 1);
        }
        
        // Draw "Cannot Fit" label above piece with background for visibility
        const labelText = '✗ Cannot Fit';
        ctx.font = 'bold 10px sans-serif';
        const labelMetrics = ctx.measureText(labelText);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.fillRect(x + displayW / 2 - labelMetrics.width / 2 - 4, y - 18, labelMetrics.width + 8, 14);
        ctx.fillStyle = '#dc2626';
        ctx.textAlign = 'center';
        ctx.fillText(labelText, x + displayW / 2, y - 6);
    });
    
    // Draw separator line
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.beginPath();
    ctx.moveTo(sectionPadding + 10, sectionY + 5);
    ctx.lineTo(cw - sectionPadding - 10, sectionY + 5);
    ctx.stroke();
    ctx.setLineDash([]);
}

document.addEventListener('DOMContentLoaded', initializePasteHandlers);
