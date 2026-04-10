/**
 * Mueve 5 - Strategist Edition: Master of Deception II (In-Path Traps)
 */

class Game {
    constructor() {
        this.config = {
            boardSize: 8,
            wallDensity: 0.12,
            levelToMetasRatio: 2,
            moveDelay: 100,
            initialJumpBudget: 5
        };

        this.data = JSON.parse(localStorage.getItem('mueve5_data')) || {
            gameMode: 'CLASSIC',
            classicLevel: 1,
            puzzleLevel: 1
        };

        this.gameMode = this.data.gameMode;
        this.level = this.gameMode === 'CLASSIC' ? this.data.classicLevel : this.data.puzzleLevel;

        this.playerPos = { x: 0, y: 0 };
        this.targets = [];
        this.walls = [];
        this.currentMaxJump = this.config.initialJumpBudget;
        this.gameState = 'START';
        this.isAnimating = false;
        
        this.history = []; 
        this.initialLevelState = null;

        this.init();
    }

    init() {
        this.boardEl = document.getElementById('board');
        this.playerEl = document.getElementById('player');
        this.levelValEl = document.getElementById('level-val');
        this.movesValEl = document.getElementById('moves-val');
        this.movesLabelEl = document.getElementById('moves-label');
        
        document.documentElement.style.setProperty('--grid-size', this.config.boardSize);
        
        this.createBoardElements();
        this.setupEventListeners();
        this.updateModeUI();
        this.handleInstallPrompt();
    }

    savePersistentData() {
        if (this.gameMode === 'CLASSIC') this.data.classicLevel = this.level;
        else this.data.puzzleLevel = this.level;
        this.data.gameMode = this.gameMode;
        localStorage.setItem('mueve5_data', JSON.stringify(this.data));
    }

    createBoardElements() {
        this.boardEl.innerHTML = '';
        this.playerEl = document.createElement('div');
        this.playerEl.id = 'player';
        this.boardEl.appendChild(this.playerEl);
        for (let y = 0; y < this.config.boardSize; y++) {
            for (let x = 0; x < this.config.boardSize; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.id = `cell-${x}-${y}`;
                this.boardEl.appendChild(cell);
            }
        }
    }

    setupEventListeners() {
        document.getElementById('start-btn').addEventListener('click', () => this.startGame());
        document.getElementById('next-level-btn').addEventListener('click', () => this.nextLevel());
        document.getElementById('restart-btn').addEventListener('click', () => this.startGame());
        document.getElementById('level-select-btn').addEventListener('click', () => this.showLevelGrid());
        document.getElementById('menu-btn').addEventListener('click', () => this.showMenu());
        
        document.getElementById('set-classic-mode').addEventListener('click', () => this.setMode('CLASSIC'));
        document.getElementById('set-puzzle-mode').addEventListener('click', () => this.setMode('PUZZLE'));

        document.getElementById('close-level-grid').addEventListener('click', () => {
            document.getElementById('level-grid-overlay').classList.remove('active');
            if (this.gameState === 'START') document.getElementById('start-overlay').classList.add('active');
        });
        
        document.getElementById('undo-btn').addEventListener('click', () => this.undoMove());
        document.getElementById('restart-level-btn').addEventListener('click', () => this.restartLevel());
        document.getElementById('level-display').addEventListener('click', () => this.showLevelGrid());
        window.addEventListener('resize', () => this.updateUI());
    }

    setMode(mode) {
        if (this.isAnimating) return;
        this.gameMode = mode;
        this.level = mode === 'CLASSIC' ? this.data.classicLevel : this.data.puzzleLevel;
        this.currentMaxJump = this.config.initialJumpBudget;
        this.savePersistentData();
        this.updateModeUI();
        this.updateUI();
        this.vibrate(20);
    }

    updateModeUI() {
        const classicBtn = document.getElementById('set-classic-mode');
        const puzzleBtn = document.getElementById('set-puzzle-mode');
        if (this.gameMode === 'CLASSIC') {
            classicBtn.classList.add('active');
            puzzleBtn.classList.remove('active');
            this.boardEl.classList.add('classic-mode');
            this.movesLabelEl.innerText = 'Pasos';
        } else {
            classicBtn.classList.remove('active');
            puzzleBtn.classList.add('active');
            this.boardEl.classList.remove('classic-mode');
            this.movesLabelEl.innerText = 'Salto';
        }
    }

    startGame() {
        if (this.isAnimating) return;
        this.gameState = 'PLAYING';
        this.closeOverlays();
        this.generateLevel();
        if (this.playerEl) this.playerEl.classList.add('active');
        this.updateUI();
    }

    nextLevel() {
        if (this.isAnimating) return;
        if (this.level < 100) {
            this.level++;
        }
        this.savePersistentData();
        this.startGame();
    }

    generateLevel() {
        this.walls = [];
        this.targets = [];
        this.currentMaxJump = this.config.initialJumpBudget;
        const totalCells = this.config.boardSize * this.config.boardSize;

        // Generate Walls
        for (let i = 0; i < totalCells * this.config.wallDensity; i++) {
            const wx = Math.floor(Math.random() * this.config.boardSize);
            const wy = Math.floor(Math.random() * this.config.boardSize);
            if ((wx===0 && wy===0) || (wx===0 && wy===7) || (wx===7 && wy===0) || (wx===7 && wy===7)) continue;
            if (!this.walls.some(w => w.x === wx && w.y === wy)) this.walls.push({ x: wx, y: wy });
        }

        // Player starting pos
        do {
            this.playerPos = {
                x: Math.floor(Math.random() * this.config.boardSize),
                y: Math.floor(Math.random() * this.config.boardSize)
            };
        } while (this.isWall(this.playerPos.x, this.playerPos.y));

        // BACKBONE
        const corners = [{x:0,y:0}, {x:7,y:0}, {x:7,y:7}, {x:0,y:7}];
        const shift = Math.floor(Math.random() * 4);
        const orderedCorners = corners.slice(shift).concat(corners.slice(0, shift));

        let currentPos = { ...this.playerPos };
        let currentBudget = this.config.initialJumpBudget;
        const backbone = [];

        for (const corner of orderedCorners) {
            const result = this.constructBackboneSegment(currentPos, corner, currentBudget, backbone);
            if (!result) return this.generateLevel(); 
            currentPos = result.newPos;
            currentBudget = result.newBudget;
        }
        this.targets = backbone;

        // --- DECEPTION LOGIC ---
        if (this.gameMode === 'PUZZLE' && this.targets.length > 2) {
            // 1. Primary Trap (The Closer Cebo)
            const firstTarget = this.targets[0];
            const distToReal = this.getShortestPath(this.playerPos, firstTarget).length;
            const possibleTrapCells = this.findReachableCells(this.playerPos, distToReal - 1);
            const validStartTrap = possibleTrapCells.filter(pt => !this.isWall(pt.x, pt.y) && !this.targets.some(t => t.x === pt.x && t.y === pt.y));
            if (validStartTrap.length > 0) {
                const trapCell = validStartTrap[Math.floor(Math.random() * validStartTrap.length)];
                this.targets.push({ ...trapCell, collected: false, value: 2 });
            }

            // 2. In-Path Decoys (Distracciones en Ruta)
            // Pick 2 random targets (excluding the last one) to add a decoy near them
            const potentialBases = this.targets.filter((t, idx) => idx < this.targets.length - 1 && t.collected === false);
            const shuffledBases = potentialBases.sort(() => 0.5 - Math.random()).slice(0, 2);
            
            shuffledBases.forEach(base => {
                const reach = this.findReachableCells(base, base.value);
                const decoys = reach.filter(pt => !this.isWall(pt.x, pt.y) && !this.targets.some(t => t.x === pt.x && t.y === pt.y));
                if (decoys.length > 0) {
                    // Bias towards decoys that are closer to the base than the next actual target
                    const decoy = decoys[Math.floor(Math.random() * decoys.length)];
                    this.targets.push({ ...decoy, collected: false, value: 2 });
                }
            });
        }

        // Extra Metas
        // Max 15 targets to prevent board saturation
        const metasCount = this.gameMode === 'CLASSIC' ? Math.min(15, 5 + Math.floor(this.level / 2)) : 10;
        const numTotalTargets = Math.max(metasCount, this.targets.length);
        while (this.targets.length < numTotalTargets) {
            const source = this.targets[Math.floor(Math.random() * this.targets.length)];
            const budget = this.gameMode === 'CLASSIC' ? 5 : source.value;
            const reachable = this.findReachableCells(source, budget);
            const valid = reachable.filter(pt => !this.isWall(pt.x, pt.y) && !this.targets.some(t => t.x === pt.x && t.y === pt.y));
            if (valid.length === 0) break;
            const extra = valid[Math.floor(Math.random() * valid.length)];
            this.targets.push({ ...extra, collected: false, value: this.gameMode === 'CLASSIC' ? 5 : 2 });
        }

        this.history = [];
        this.initialLevelState = {
            playerPos: { ...this.playerPos },
            targets: JSON.parse(JSON.stringify(this.targets)),
            walls: JSON.parse(JSON.stringify(this.walls)),
            currentMaxJump: this.config.initialJumpBudget
        };
        this.saveHistory();
        this.renderEntities();
    }

    constructBackboneSegment(start, dest, budget, backbone) {
        let cur = { ...start };
        let curBudget = budget;
        while (true) {
            const path = this.getShortestPath(cur, dest);
            if (!path) return null;
            if (path.length <= curBudget && path.length > 0) {
                const nextBudget = this.gameMode === 'CLASSIC' ? 5 : Math.floor(Math.random() * 3) + 3;
                const target = { ...dest, collected: false, value: nextBudget };
                if (!backbone.some(t => t.x === target.x && t.y === target.y)) backbone.push(target);
                else backbone[backbone.findIndex(t => t.x === target.x && t.y === target.y)].value = nextBudget;
                return { newPos: target, newBudget: nextBudget };
            }
            const reachable = this.findReachableCells(cur, curBudget);
            reachable.sort((a, b) => (this.getShortestPath(a, dest)?.length || 999) - (this.getShortestPath(b, dest)?.length || 999));
            const best = reachable.find(pt => !this.isWall(pt.x, pt.y) && !backbone.some(t => t.x === pt.x && t.y === pt.y));
            if (!best) return null;
            const nextBudget = this.gameMode === 'CLASSIC' ? 5 : Math.floor(Math.random() * 3) + 3;
            const inter = { ...best, collected: false, value: nextBudget };
            backbone.push(inter);
            cur = { ...inter };
            curBudget = nextBudget;
        }
    }

    saveHistory() {
        this.history.push({
            playerPos: { ...this.playerPos },
            currentMaxJump: this.currentMaxJump,
            targets: JSON.parse(JSON.stringify(this.targets))
        });
    }

    undoMove() {
        if (this.gameState !== 'PLAYING' || this.history.length <= 1 || this.isAnimating) return;
        this.history.pop();
        const prevState = this.history[this.history.length - 1];
        this.playerPos = { ...prevState.playerPos };
        this.currentMaxJump = prevState.currentMaxJump;
        this.targets = JSON.parse(JSON.stringify(prevState.targets));
        this.vibrate(10);
        this.renderEntities();
        this.updateUI();
    }

    restartLevel() {
        if (!this.initialLevelState || this.isAnimating) return;
        this.gameState = 'PLAYING';
        this.closeOverlays();
        if (this.playerEl) this.playerEl.classList.add('active');
        this.playerPos = { ...this.initialLevelState.playerPos };
        this.targets = JSON.parse(JSON.stringify(this.initialLevelState.targets));
        this.currentMaxJump = this.initialLevelState.currentMaxJump;
        this.history = [];
        this.saveHistory();
        this.renderEntities();
        this.updateUI();
        this.vibrate([50, 50]);
    }

    showLevelGrid() {
        if (this.isAnimating) return;
        this.closeOverlays();
        const container = document.getElementById('level-grid-container');
        container.innerHTML = '';
        for (let i = 1; i <= 100; i++) {
            const square = document.createElement('div');
            square.className = 'level-square' + (i === this.level ? ' current' : '');
            square.innerText = i;
            square.addEventListener('click', () => {
                this.level = i;
                this.savePersistentData();
                this.startGame();
            });
            container.appendChild(square);
        }
        document.getElementById('level-grid-overlay').classList.add('active');
    }

    findReachableCells(start, maxDist) {
        if (maxDist <= 0) return [];
        const reachable = [];
        const queue = [{ x: start.x, y: start.y, dist: 0 }];
        const visited = new Set([`${start.x},${start.y}`]);
        while (queue.length > 0) {
            const { x, y, dist } = queue.shift();
            if (dist > 0 && dist <= maxDist) reachable.push({ x, y });
            if (dist < maxDist) {
                [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}].forEach(o => {
                    const nx = x + o.x, ny = y + o.y;
                    if (nx>=0 && nx<this.config.boardSize && ny>=0 && ny<this.config.boardSize && 
                        !visited.has(`${nx},${ny}`) && !this.isWall(nx, ny)) {
                        visited.add(`${nx},${ny}`);
                        queue.push({ x: nx, y: ny, dist: dist + 1 });
                    }
                });
            }
        }
        return reachable;
    }

    isWall(x, y) { return this.walls.some(w => w.x === x && w.y === y); }

    renderEntities() {
        document.querySelectorAll('.cell').forEach(c => {
            c.classList.remove('wall');
            c.innerHTML = '';
            c.style.cursor = 'default';
            c.onclick = null;
        });
        this.walls.forEach(w => this.getCell(w.x, w.y).classList.add('wall'));
        this.targets.forEach((t) => {
            if (t.collected) return; 
            const cell = this.getCell(t.x, t.y);
            const targetEl = document.createElement('div');
            targetEl.className = 'target';
            targetEl.dataset.value = t.value;
            cell.appendChild(targetEl);
            cell.style.cursor = 'pointer';
            cell.onclick = () => this.handleTargetClick(t);
        });
    }

    getCell(x, y) { return document.getElementById(`cell-${x}-${y}`); }

    updateUI() {
        this.levelValEl.innerText = this.level;
        this.movesValEl.innerText = this.gameMode === 'CLASSIC' ? `5` : this.currentMaxJump;
        const cell = this.getCell(this.playerPos.x, this.playerPos.y);
        if (cell && this.playerEl) {
            const x = cell.offsetLeft + cell.offsetWidth / 2;
            const y = cell.offsetTop + cell.offsetHeight / 2;
            this.playerEl.style.left = `${x}px`;
            this.playerEl.style.top = `${y}px`;
        }
    }

    async handleTargetClick(target) {
        if (this.gameState !== 'PLAYING' || this.isAnimating) return;
        const path = this.getShortestPath(this.playerPos, target);
        const dist = path ? path.length : Infinity;
        const budget = this.gameMode === 'CLASSIC' ? 5 : this.currentMaxJump;
        if (dist <= budget) {
            this.isAnimating = true;
            for (const step of path) {
                this.playerPos = { x: step.x, y: step.y };
                this.updateUI();
                await new Promise(r => setTimeout(r, this.config.moveDelay));
            }
            if (this.gameMode === 'PUZZLE') this.currentMaxJump = target.value; 
            target.collected = true;
            this.saveHistory();
            this.vibrate([30, 50, 30]);
            this.renderEntities();
            this.updateUI();
            this.isAnimating = false;
            if (this.targets.every(t => t.collected)) this.win();
            else this.checkStuck();
        } else {
            const cell = this.getCell(target.x, target.y);
            cell.classList.add('invalid-move-flash');
            setTimeout(() => cell.classList.remove('invalid-move-flash'), 300);
            this.vibrate(100);
        }
    }

    getShortestPath(start, end) {
        if (start.x === end.x && start.y === end.y) return [];
        const queue = [[start]];
        const visited = new Set([`${start.x},${start.y}`]);
        while (queue.length > 0) {
            const path = queue.shift();
            const { x, y } = path[path.length - 1];
            if (x === end.x && y === end.y) return path.slice(1);
            [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}].forEach(o => {
                const nx = x + o.x, ny = y + o.y;
                if (nx>=0 && nx<this.config.boardSize && ny>=0 && ny<this.config.boardSize && 
                    !visited.has(`${nx},${ny}`) && !this.isWall(nx, ny)) {
                    visited.add(`${nx},${ny}`);
                    queue.push([...path, { x: nx, y: ny }]);
                }
            });
        }
        return null;
    }

    checkStuck() {
        const remainingTargets = this.targets.filter(t => !t.collected);
        const budget = this.gameMode === 'CLASSIC' ? 5 : this.currentMaxJump;
        const reachable = remainingTargets.some(t => {
            const path = this.getShortestPath(this.playerPos, t);
            return path && path.length <= budget;
        });
        if (!reachable) this.gameOver(`Estás bloqueado: Tu salto actual es de ${budget} pasos, pero ninguna meta está al alcance.`);
    }

    win() {
        this.gameState = 'WIN';
        document.getElementById('win-overlay').classList.add('active');
    }

    gameOver(reason) {
        this.gameState = 'LOSE';
        document.getElementById('lose-reason').innerText = reason;
        document.getElementById('lose-overlay').classList.add('active');
        this.vibrate(200);
    }

    closeOverlays() { document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active')); }
    showMenu() {
        if (this.isAnimating) return;
        this.gameState = 'START';
        this.closeOverlays();
        document.getElementById('start-overlay').classList.add('active');
        if (this.playerEl) this.playerEl.classList.remove('active');
    }

    vibrate(p) { if (navigator.vibrate) navigator.vibrate(p); }
    handleInstallPrompt() {
        let dp; const btn = document.getElementById('install-button');
        window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); dp = e; btn.style.display = 'block'; });
        btn.addEventListener('click', async () => { if (dp) { dp.prompt(); const { outcome } = await dp.userChoice; if (outcome === 'accepted') btn.style.display = 'none'; dp = null; } });
    }
}

window.addEventListener('DOMContentLoaded', () => { new Game(); });
