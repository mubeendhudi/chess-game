/* =========================================================
   Chess Game - script.js
   Rules and validation: chess.js  |  UI and interaction: this file
   ========================================================= */

// ---------- Game state ----------
const game = new Chess();       // chess.js instance (holds the whole game)
let selectedSquare = null;      // e.g. "e2" when a piece is selected
let legalTargets = [];          // verbose move objects for the selected piece
let lastMove = null;            // { from, to } of the last played move
let pendingPromotion = null;    // { from, to } while waiting for promotion choice
let dragFrom = null;            // square a piece is being dragged from

// ---------- DOM references ----------
const boardEl = document.getElementById("board");
const statusEl = document.getElementById("status");
const historyEl = document.getElementById("history");
const resetBtn = document.getElementById("resetBtn");
const modalEl = document.getElementById("promotionModal");
const promoChoicesEl = document.getElementById("promotionChoices");

// ---------- Piece symbols ----------
// Solid glyphs are used for both colors; CSS colors them white or black.
const PIECE_SYMBOLS = {
    k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟︎"
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

/* ---------------------------------------------------------
   Rendering
   --------------------------------------------------------- */

// Rebuilds the entire board from the current game position.
function renderBoard() {
    boardEl.innerHTML = "";
    const position = game.board(); // 8x8 array, row 0 = rank 8
    const kingInCheckSquare = game.in_check() ? findKingSquare(game.turn()) : null;

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const squareName = FILES[col] + (8 - row);
            const isLight = (row + col) % 2 === 0;

            const sq = document.createElement("div");
            sq.className = "square " + (isLight ? "light" : "dark");
            sq.dataset.square = squareName;

            // State classes for highlights
            if (squareName === selectedSquare) sq.classList.add("selected");
            if (lastMove && (squareName === lastMove.from || squareName === lastMove.to)) {
                sq.classList.add("last-move");
            }
            if (squareName === kingInCheckSquare) sq.classList.add("in-check");

            // Legal move indicators (dot for move, ring for capture)
            const target = legalTargets.find(m => m.to === squareName);
            if (target) {
                sq.classList.add("legal");
                if (target.captured || target.flags.includes("e")) sq.classList.add("capture");
            }

            // Board coordinates on the edges
            if (col === 0) addCoord(sq, "rank", String(8 - row));
            if (row === 7) addCoord(sq, "file", FILES[col]);

            // Piece (if any)
            const piece = position[row][col];
            if (piece) {
                const pieceEl = document.createElement("span");
                pieceEl.className = "piece " + piece.color;
                pieceEl.textContent = PIECE_SYMBOLS[piece.type];
                pieceEl.dataset.square = squareName;

                // Only the side to move can drag its own pieces
                const canDrag = piece.color === game.turn() && !game.game_over();
                pieceEl.draggable = canDrag;
                if (canDrag) {
                    pieceEl.addEventListener("dragstart", onDragStart);
                    pieceEl.addEventListener("dragend", onDragEnd);
                }
                sq.appendChild(pieceEl);
            }

            // Click-to-move and drag-and-drop targets
            sq.addEventListener("click", () => onSquareClick(squareName));
            sq.addEventListener("dragover", onDragOver);
            sq.addEventListener("dragleave", onDragLeave);
            sq.addEventListener("drop", onDrop);

            boardEl.appendChild(sq);
        }
    }
}

// Adds a small rank/file label to a square.
function addCoord(square, type, text) {
    const label = document.createElement("span");
    label.className = "coord " + type;
    label.textContent = text;
    square.appendChild(label);
}

// Finds the square of the king for the given color ("w" or "b").
function findKingSquare(color) {
    const position = game.board();
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const p = position[row][col];
            if (p && p.type === "k" && p.color === color) {
                return FILES[col] + (8 - row);
            }
        }
    }
    return null;
}

// Updates the status bar: turn, check, checkmate or draw.
function updateStatus() {
    const turnName = game.turn() === "w" ? "White" : "Black";
    statusEl.className = "status";

    if (game.in_checkmate()) {
        const winner = game.turn() === "w" ? "Black" : "White";
        statusEl.textContent = `Checkmate! ${winner} wins.`;
        statusEl.classList.add("checkmate");
    } else if (game.in_stalemate()) {
        statusEl.textContent = "Draw by stalemate.";
        statusEl.classList.add("draw");
    } else if (game.in_threefold_repetition()) {
        statusEl.textContent = "Draw by threefold repetition.";
        statusEl.classList.add("draw");
    } else if (game.insufficient_material()) {
        statusEl.textContent = "Draw: insufficient material.";
        statusEl.classList.add("draw");
    } else if (game.in_draw()) {
        statusEl.textContent = "Draw (50-move rule).";
        statusEl.classList.add("draw");
    } else if (game.in_check()) {
        statusEl.textContent = `Check! ${turnName} to move.`;
        statusEl.classList.add("check");
    } else {
        statusEl.textContent = `${turnName} to move`;
    }
}

// Rebuilds the move history list (White move | Black move per row).
function updateHistory() {
    const moves = game.history(); // array of SAN strings, e.g. ["e4", "e5", "Nf3"]
    historyEl.innerHTML = "";

    if (moves.length === 0) {
        historyEl.innerHTML = '<p class="empty-note">No moves yet.</p>';
        return;
    }

    for (let i = 0; i < moves.length; i += 2) {
        const row = document.createElement("div");
        row.className = "move-row";
        row.innerHTML =
            `<span class="move-num">${i / 2 + 1}.</span>` +
            `<span class="move-san">${moves[i]}</span>` +
            `<span class="move-san">${moves[i + 1] || ""}</span>`;
        historyEl.appendChild(row);
    }
    historyEl.scrollTop = historyEl.scrollHeight; // auto-scroll to latest move
}

// Refreshes everything on screen.
function refreshUI() {
    renderBoard();
    updateStatus();
    updateHistory();
}

/* ---------------------------------------------------------
   Move logic
   --------------------------------------------------------- */

// Selects a piece and calculates its legal destination squares.
function selectSquare(squareName) {
    selectedSquare = squareName;
    legalTargets = game.moves({ square: squareName, verbose: true });
}

// Clears the current selection.
function clearSelection() {
    selectedSquare = null;
    legalTargets = [];
}

// Handles click-to-move behavior.
function onSquareClick(squareName) {
    if (game.game_over() || pendingPromotion) return;

    const piece = game.get(squareName);

    // A piece is already selected and the clicked square is a legal target -> move
    if (selectedSquare && legalTargets.some(m => m.to === squareName)) {
        attemptMove(selectedSquare, squareName);
        return;
    }

    // Clicking one of your own pieces selects it (or deselects if same square)
    if (piece && piece.color === game.turn()) {
        if (selectedSquare === squareName) {
            clearSelection();
        } else {
            selectSquare(squareName);
        }
    } else {
        clearSelection();
    }
    renderBoard();
}

// Tries to play a move; opens the promotion dialog if needed.
function attemptMove(from, to) {
    const candidates = game.moves({ square: from, verbose: true }).filter(m => m.to === to);
    if (candidates.length === 0) {
        clearSelection();
        renderBoard();
        return;
    }

    // Promotion: pawn reaching the last rank has 4 candidate moves (q, r, b, n)
    if (candidates[0].flags.includes("p")) {
        pendingPromotion = { from, to };
        showPromotionModal(game.turn());
        return;
    }

    executeMove(from, to);
}

// Plays the move and updates the UI.
function executeMove(from, to, promotion) {
    const move = game.move({ from, to, promotion });
    if (move) lastMove = { from, to };
    clearSelection();
    refreshUI();
}

/* ---------------------------------------------------------
   Promotion dialog
   --------------------------------------------------------- */

function showPromotionModal(color) {
    promoChoicesEl.innerHTML = "";
    ["q", "r", "b", "n"].forEach(type => {
        const btn = document.createElement("button");
        btn.className = "promo-btn " + color;
        btn.textContent = PIECE_SYMBOLS[type];
        btn.title = { q: "Queen", r: "Rook", b: "Bishop", n: "Knight" }[type];
        btn.addEventListener("click", () => {
            const { from, to } = pendingPromotion;
            pendingPromotion = null;
            modalEl.classList.add("hidden");
            executeMove(from, to, type);
        });
        promoChoicesEl.appendChild(btn);
    });
    modalEl.classList.remove("hidden");
}

/* ---------------------------------------------------------
   Drag and drop
   --------------------------------------------------------- */

function onDragStart(e) {
    if (game.game_over() || pendingPromotion) {
        e.preventDefault();
        return;
    }
    dragFrom = e.target.dataset.square;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", dragFrom);

    // Show legal moves while dragging (re-render after the drag image is captured)
    selectSquare(dragFrom);
    setTimeout(renderBoard, 0);
}

function onDragEnd() {
    dragFrom = null;
    document.querySelectorAll(".drag-over").forEach(el => el.classList.remove("drag-over"));
}

function onDragOver(e) {
    e.preventDefault(); // required to allow dropping
    e.currentTarget.classList.add("drag-over");
}

function onDragLeave(e) {
    e.currentTarget.classList.remove("drag-over");
}

function onDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.remove("drag-over");
    const to = e.currentTarget.dataset.square;
    const from = dragFrom || e.dataTransfer.getData("text/plain");
    dragFrom = null;
    if (!from) return;

    if (from !== to && legalTargets.some(m => m.to === to)) {
        attemptMove(from, to);
    } else {
        clearSelection();
        renderBoard();
    }
}

/* ---------------------------------------------------------
   Reset
   --------------------------------------------------------- */

function resetGame() {
    game.reset();
    clearSelection();
    lastMove = null;
    pendingPromotion = null;
    modalEl.classList.add("hidden");
    refreshUI();
}

resetBtn.addEventListener("click", resetGame);

// ---------- Start the game ----------
refreshUI();