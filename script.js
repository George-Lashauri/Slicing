// Global state
let placements = [];
const INITIAL_ROWS = 5;

// Create a new cut row
function createCutRow(rowNumber) {
    const tr = document.createElement('tr');
    tr.className = 'cut-row';
    tr.innerHTML = `
        <td class="cut-number">${rowNumber}</td>
        <td><input type="number" class="cut-width" placeholder="e.g., 1000" min="1"></td>
        <td><input type="number" class="cut-height" placeholder="e.g., 500" min="1"></td>
        <td><input type="number" class="cut-quantity" placeholder="1" min="1" value="1"></td>
    `;
    
    // Add paste handler to new inputs
    const inputs = tr.querySelectorAll('input');
    inputs.forEach(input => {
        input.addEventListener('paste', (e) => handlePaste(e));
    });
    
    return tr;
}

// Initialize paste handlers for cut cells
function initializePasteHandlers() {
    const cutRows = document.querySelectorAll('.cut-row');
    
    cutRows.forEach((row, rowIndex) => {
        const inputs = row.querySelectorAll('input');
        
        inputs.forEach((input, colIndex) => {
            input.addEventListener('paste', (e) => handlePaste(e));
        });
    });
}

// Handle paste event with smart distribution and dynamic row creation
function handlePaste(event) {
    event.preventDefault();
    
    // Get pasted data
    const pastedText = event.clipboardData.getData('text/plain');
    const lines = pastedText.trim().split('\n');
    
    // Parse the pasted data
    const data = [];
    lines.forEach(line => {
        const values = line.trim().split(/\s+|,\s*/);
        values.forEach(val => {
            if (val) data.push(val);
        });
    });
    
    if (data.length === 0) return;
    
    // Get all input cells
    let allInputs = Array.from(document.querySelectorAll('.cuts-table input'));
    const startIndex = allInputs.indexOf(event.target);
    const tbody = document.getElementById('cutsList');
    
    // Calculate how many rows we need
    const currentRows = document.querySelectorAll('.cut-row').length;
    const inputsPerRow = 3; // width, height, quantity (not counting the number cell)
    const rowsNeeded = Math.ceil(data.length / inputsPerRow);
    
    // Add new rows if needed
    if (rowsNeeded > currentRows) {
        for (let i = currentRows + 1; i <= rowsNeeded; i++) {
            tbody.appendChild(createCutRow(i));
        }
        // Refresh the inputs array after adding new rows
        allInputs = Array.from(document.querySelectorAll('.cuts-table input'));
    }
    
    // Distribute data starting from current cell
    data.forEach((value, index) => {
        const targetIndex = startIndex + index;
        if (targetIndex < allInputs.length) {
            allInputs[targetIndex].value = value;
            allInputs[targetIndex].dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
}

// Reset form to initial state
function resetForm() {
    const tbody = document.getElementById('cutsList');
    const allRows = document.querySelectorAll('.cut-row');
    
    // Clear all input values
    document.querySelectorAll('.cuts-table input').forEach(input => {
        input.value = '';
    });
    
    // Remove extra rows (keep only initial 5)
    if (allRows.length > INITIAL_ROWS) {
        for (let i = allRows.length - 1; i >= INITIAL_ROWS; i--) {
            allRows[i].remove();
        }
    }
    
    // Reset board number to 1
    document.getElementById('numBoards').value = '1';
    
    // Hide results
    document.getElementById('resultStatus').style.display = 'none';
    document.getElementById('statsContainer').style.display = 'none';
    document.getElementById('placementInfo').style.display = 'none';
    document.getElementById('noResultMessage').style.display = 'block';
}

// Get cut items from form
function getCutItems() {
    const cuts = [];
    const cutRows = document.querySelectorAll('.cut-row');
    
    cutRows.forEach(row => {
        const widthInput = row.querySelector('.cut-width');
        const heightInput = row.querySelector('.cut-height');
        const quantityInput = row.querySelector('.cut-quantity');
        
        const width = parseInt(widthInput.value) || 0;
        const height = parseInt(heightInput.value) || 0;
        const quantity = parseInt(quantityInput.value) || 0;
        
        if (width > 0 && height > 0 && quantity > 0) {
            for (let i = 0; i < quantity; i++) {
                cuts.push({ width, height, id: cuts.length });
            }
        }
    });
    
    return cuts;
}

// Pack rectangles across multiple boards
function packMultipleBoards(boardWidth, boardHeight, numBoards, rectangles) {
    const allPlacements = [];
    let remainingRects = [...rectangles];
    
    // Calculate how many full boards we have
    const fullBoards = Math.floor(numBoards);
    const hasPartialBoard = numBoards % 1 !== 0;
    
    // Pack into each full board
    for (let boardIdx = 0; boardIdx < fullBoards; boardIdx++) {
        const boardPlacements = packRectangles(boardWidth, boardHeight, remainingRects);
        
        // Add board index to placements and separate successful from failed
        const successful = boardPlacements.filter(p => !p.failed);
        const failed = boardPlacements.filter(p => p.failed);
        
        successful.forEach(p => {
            allPlacements.push({ ...p, boardNumber: boardIdx + 1 });
        });
        
        // Keep only failed pieces for next board
        remainingRects = failed.map(f => ({
            width: f.width,
            height: f.height,
            id: f.id,
            originalId: f.originalId
        }));
    }
    
    // Pack into partial board if it exists
    if (hasPartialBoard && remainingRects.length > 0) {
        const partialHeight = Math.floor(boardHeight / 2);
        const boardPlacements = packRectangles(boardWidth, partialHeight, remainingRects);
        
        const successful = boardPlacements.filter(p => !p.failed);
        const failed = boardPlacements.filter(p => p.failed);
        
        successful.forEach(p => {
            allPlacements.push({ ...p, boardNumber: fullBoards + 1, isPartial: true });
        });
        
        // Add remaining failed pieces
        failed.forEach(f => {
            allPlacements.push({ ...f, boardNumber: fullBoards + 1, failed: true });
        });
    } else if (remainingRects.length > 0) {
        // If no partial board, mark remaining as failed
        remainingRects.forEach(rect => {
            allPlacements.push({
                x: -1,
                y: -1,
                width: rect.width,
                height: rect.height,
                id: rect.id,
                originalId: rect.originalId,
                failed: true
            });
        });
    }
    
    return allPlacements;
}

// Spacing between cuts (in mm)
const CUT_SPACING = 3;

// 2D Bin Packing Algorithm - Guillotine Heuristic
function packRectangles(boardWidth, boardHeight, rectangles) {
    const placements = [];
    const usedRectangles = new Set();
    
    // Try to pack each rectangle
    for (let i = 0; i < rectangles.length; i++) {
        const rect = rectangles[i];
        let placed = false;
        
        // Try both orientations (normal and rotated)
        const orientations = [
            { w: rect.width, h: rect.height },
            { w: rect.height, h: rect.width }
        ];
        
        for (const orientation of orientations) {
            if (placed) break;
            
            // Try to place in each free space
            const freeSpaces = getFreeSpaces(boardWidth, boardHeight, placements);
            
            for (const space of freeSpaces) {
                if (placed) break;
                
                if (canPlaceRectangle(orientation.w, orientation.h, space)) {
                    placements.push({
                        x: space.x,
                        y: space.y,
                        width: orientation.w,
                        height: orientation.h,
                        id: rect.id,
                        originalId: i,
                        rotated: orientation.w !== rect.width
                    });
                    usedRectangles.add(i);
                    placed = true;
                }
            }
        }
        
        if (!placed) {
            placements.push({
                x: -1,
                y: -1,
                width: rect.width,
                height: rect.height,
                id: rect.id,
                originalId: i,
                failed: true
            });
        }
    }
    
    return placements;
}

// Get free spaces on the board
function getFreeSpaces(boardWidth, boardHeight, placements) {
    const spaces = [];
    
    // Initial space is the entire board
    if (placements.length === 0) {
        return [{ x: 0, y: 0, width: boardWidth, height: boardHeight }];
    }
    
    // Collect all placement positions with spacing
    const usedRects = placements.filter(p => !p.failed);
    
    // Generate candidate positions
    const positions = new Set();
    positions.add('0,0');
    
    usedRects.forEach(rect => {
        // Add positions after rectangle with spacing
        positions.add(`${rect.x + rect.width + CUT_SPACING},${rect.y}`);
        positions.add(`${rect.x},${rect.y + rect.height + CUT_SPACING}`);
    });
    
    for (const pos of positions) {
        const [x, y] = pos.split(',').map(Number);
        if (x >= 0 && y >= 0 && x < boardWidth && y < boardHeight) {
            const width = boardWidth - x;
            const height = boardHeight - y;
            
            if (width > 0 && height > 0 && !isOverlapping(x, y, width, height, usedRects)) {
                spaces.push({ x, y, width, height });
            }
        }
    }
    
    // Sort spaces by area (larger first)
    spaces.sort((a, b) => (b.width * b.height) - (a.width * a.height));
    
    return spaces;
}

// Check if rectangle can fit in space (with spacing consideration)
function canPlaceRectangle(rectWidth, rectHeight, space) {
    // Account for spacing on all sides except edges
    return rectWidth <= space.width && rectHeight <= space.height;
}

// Check if position overlaps with existing rectangles (with spacing)
function isOverlapping(x, y, width, height, rectangles) {
    return rectangles.some(rect => {
        // Add spacing around existing rectangles
        const rectLeft = rect.x - CUT_SPACING;
        const rectRight = rect.x + rect.width + CUT_SPACING;
        const rectTop = rect.y - CUT_SPACING;
        const rectBottom = rect.y + rect.height + CUT_SPACING;
        
        return !(x + width <= rectLeft || 
                 x >= rectRight || 
                 y + height <= rectTop || 
                 y >= rectBottom);
    });
}

// Calculate cutting statistics
function calculateCutting() {
    const boardWidth = parseInt(document.getElementById('boardWidth').value);
    const boardHeight = parseInt(document.getElementById('boardHeight').value);
    const numBoards = parseFloat(document.getElementById('numBoards').value);
    const cuts = getCutItems();
    
    // Validation
    if (!boardWidth || !boardHeight) {
        alert('Please enter board dimensions');
        return;
    }
    
    if (numBoards <= 0) {
        alert('Please enter a valid number of boards (minimum 0.5)');
        return;
    }
    
    if (cuts.length === 0) {
        alert('Please add at least one cut piece');
        return;
    }
    
    // Pack rectangles across multiple boards
    placements = packMultipleBoards(boardWidth, boardHeight, numBoards, cuts);
    
    // Calculate statistics
    const totalCutArea = cuts.reduce((sum, cut) => sum + (cut.width * cut.height), 0);
    const singleBoardArea = boardWidth * boardHeight;
    const totalBoardArea = singleBoardArea * numBoards;
    const successfulPlacements = placements.filter(p => !p.failed);
    const failedPlacements = placements.filter(p => p.failed);
    const utilization = (totalCutArea / totalBoardArea * 100).toFixed(2);
    
    // Display results
    displayResults(boardWidth, boardHeight, cuts, successfulPlacements, failedPlacements, utilization, totalBoardArea, numBoards);
    
    // Draw visualization
    drawBoardLayout(boardWidth, boardHeight, placements, numBoards);
}

// Display results
function displayResults(boardWidth, boardHeight, cuts, successful, failed, utilization, boardArea, numBoards) {
    const resultStatus = document.getElementById('resultStatus');
    const statusMessage = document.getElementById('statusMessage');
    const statsContainer = document.getElementById('statsContainer');
    const placementInfo = document.getElementById('placementInfo');
    const placementList = document.getElementById('placementList');
    const noResultMessage = document.getElementById('noResultMessage');
    
    const totalCutArea = cuts.reduce((sum, cut) => sum + (cut.width * cut.height), 0);
    
    // Show/hide elements
    resultStatus.style.display = 'block';
    statsContainer.style.display = 'grid';
    noResultMessage.style.display = 'none';
    placementInfo.style.display = 'block';
    
    // Update status
    if (failed.length === 0) {
        resultStatus.className = 'result-status success';
        const boardText = numBoards === 1 ? 'board' : `${numBoards} boards`;
        statusMessage.innerHTML = `✓ All ${successful.length} pieces fit in ${boardText}!`;
    } else {
        resultStatus.className = 'result-status error';
        const boardText = numBoards === 1 ? 'board' : `${numBoards} boards`;
        statusMessage.innerHTML = `✗ ${failed.length} piece(s) don't fit | ${successful.length} placed successfully in ${boardText}`;
    }
    
    // Update statistics
    document.getElementById('totalCutArea').textContent = totalCutArea.toLocaleString() + ' mm²';
    document.getElementById('boardArea').textContent = boardArea.toLocaleString() + ' mm²';
    document.getElementById('utilization').textContent = utilization + '%';
    
    // Update placement list - group by board
    placementList.innerHTML = '';
    
    // Get all board numbers
    const boardNumbers = new Set(successful.map(p => p.boardNumber));
    const sortedBoards = Array.from(boardNumbers).sort((a, b) => a - b);
    
    sortedBoards.forEach(boardNum => {
        const boardHeader = document.createElement('div');
        boardHeader.style.fontWeight = 'bold';
        boardHeader.style.marginTop = '15px';
        boardHeader.style.marginBottom = '10px';
        boardHeader.style.color = '#1e40af';
        boardHeader.innerHTML = `Board #${boardNum}${successful.some(p => p.boardNumber === boardNum && p.isPartial) ? ' (Half)' : ''}`;
        placementList.appendChild(boardHeader);
        
        successful.filter(p => p.boardNumber === boardNum).forEach((placement) => {
            const item = document.createElement('div');
            item.className = 'placement-item';
            const rotatedText = placement.rotated ? ' (rotated)' : '';
            item.innerHTML = `
                <strong>Piece ${placement.originalId + 1}:</strong> 
                ${placement.width}×${placement.height}mm at (${placement.x}, ${placement.y})${rotatedText}
            `;
            placementList.appendChild(item);
        });
    });
    
    if (failed.length > 0) {
        const failedHeader = document.createElement('div');
        failedHeader.style.fontWeight = 'bold';
        failedHeader.style.marginTop = '15px';
        failedHeader.style.marginBottom = '10px';
        failedHeader.style.color = '#dc2626';
        failedHeader.innerHTML = 'Does Not Fit:';
        placementList.appendChild(failedHeader);
        
        failed.forEach((placement) => {
            const item = document.createElement('div');
            item.className = 'placement-item failed';
            item.innerHTML = `
                <strong>Piece ${placement.originalId + 1}:</strong> 
                ${placement.width}×${placement.height}mm - <em>Does not fit</em>
            `;
            placementList.appendChild(item);
        });
    }
}

// Draw board layout on canvas
function drawBoardLayout(boardWidth, boardHeight, placements, numBoards) {
    const canvas = document.getElementById('boardCanvas');
    const ctx = canvas.getContext('2d');
    
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // Get unique board numbers
    const boardNumbers = new Set(placements.filter(p => !p.failed).map(p => p.boardNumber));
    const numBoardsToShow = Math.max(boardNumbers.size, Math.ceil(numBoards));
    
    // Calculate scale and layout
    let scale, offsetX, offsetY;
    const boardsPerRow = numBoardsToShow <= 2 ? numBoardsToShow : 2;
    const boardRows = Math.ceil(numBoardsToShow / boardsPerRow);
    
    const availableWidth = canvasWidth / boardsPerRow;
    const availableHeight = canvasHeight / boardRows;
    
    scale = Math.min(availableWidth / boardWidth, availableHeight / boardHeight) * 0.85;
    
    // Clear canvas
    ctx.fillStyle = '#f9fafb';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw each board
    for (let boardIdx = 1; boardIdx <= numBoardsToShow; boardIdx++) {
        const row = Math.floor((boardIdx - 1) / boardsPerRow);
        const col = (boardIdx - 1) % boardsPerRow;
        
        offsetX = col * availableWidth + (availableWidth - boardWidth * scale) / 2;
        offsetY = row * availableHeight + 30;
        
        // Draw board
        drawSingleBoard(ctx, boardWidth, boardHeight, scale, offsetX, offsetY, boardIdx, placements);
    }
}

// Draw a single board
function drawSingleBoard(ctx, boardWidth, boardHeight, scale, offsetX, offsetY, boardNum, placements) {
    // Draw board outline
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 3;
    ctx.strokeRect(offsetX, offsetY, boardWidth * scale, boardHeight * scale);
    
    // Draw board number
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Board #${boardNum}`, offsetX + 10, offsetY - 8);
    
    // Draw board dimensions
    ctx.fillStyle = '#6b7280';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${boardWidth}mm`, offsetX + (boardWidth * scale) / 2, offsetY - 25);
    
    // Draw placements on this board
    placements.filter(p => p.boardNumber === boardNum && !p.failed).forEach((placement) => {
        const x = offsetX + placement.x * scale;
        const y = offsetY + placement.y * scale;
        const width = placement.width * scale;
        const height = placement.height * scale;
        
        // Draw spacing around piece
        ctx.fillStyle = '#f3f4f633';
        ctx.fillRect(x - CUT_SPACING * scale, y - CUT_SPACING * scale, 
                     width + 2 * CUT_SPACING * scale, height + 2 * CUT_SPACING * scale);
        
        // Draw rectangle
        ctx.fillStyle = '#10b98133';
        ctx.fillRect(x, y, width, height);
        
        // Draw border
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);
        
        // Draw text
        ctx.fillStyle = '#065f46';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const textX = x + width / 2;
        const textY = y + height / 2;
        
        if (width > 40 && height > 30) {
            ctx.fillText(`${placement.width}×${placement.height}`, textX, textY - 6);
            ctx.font = '9px sans-serif';
            ctx.fillText(`#${placement.originalId + 1}`, textX, textY + 6);
        }
    });
}

// Draw waste areas on canvas
function drawWaste(ctx, boardWidth, boardHeight, usedSpaces, offsetX, offsetY, scale) {
    ctx.fillStyle = '#ef444433';
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    
    // Simple waste visualization - show board minus used areas
    const wasteRects = calculateWaste(boardWidth, boardHeight, usedSpaces);
    
    wasteRects.forEach(waste => {
        const x = offsetX + waste.x * scale;
        const y = offsetY + waste.y * scale;
        const width = waste.width * scale;
        const height = waste.height * scale;
        
        ctx.fillRect(x, y, width, height);
        ctx.strokeRect(x, y, width, height);
    });
    
    ctx.setLineDash([]);
}

// Calculate waste areas (simplified)
function calculateWaste(boardWidth, boardHeight, usedSpaces) {
    // For simplicity, we'll just show one waste area
    // In a production app, this would be more sophisticated
    const waste = [];
    
    if (usedSpaces.length === 0) {
        waste.push({ x: 0, y: 0, width: boardWidth, height: boardHeight });
    }
    
    return waste;
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    // Show no result message initially
    document.getElementById('noResultMessage').style.display = 'block';
    
    // Initialize paste handlers
    initializePasteHandlers();
});
