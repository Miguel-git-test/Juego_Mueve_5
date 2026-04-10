/**
 * Mueve 5 - Extreme Edition: Walls, Corners & Obstacle-Aware Pathfinding
 */

class Game {
    constructor() {
        this.config = {
            boardSize: 8,
            maxJump: 5,
            wallDensity: 0.15, // Re-activated walls
            levelToMetasRatio: 2,
            startingMetas: 5,
            moveDelay: 100 // Slightly faster steps
        };

        this.level = 1;
        this.playerPos = { x: 0, y: 0 };
        this.targets = [];
        this.walls = [];
        this.currentTargetIndex = 0;
        this.movesSinceLastTarget = 0;
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
        
        document.documentElement.style.setProperty('--grid-size', this.config.boardSize);
        
        this.createBoardElements();
        this.setupEventListeners();
        this.handleInstallPrompt();
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
        
        document.getElementById('close-level-grid').addEventListener('click', () => {
            document.getElementById('level-grid-overlay').classList.remove('active');
            if (this.gameState === 'START') {
                document.getElementById('start-overlay').classList.add('active');
            }
        });
        
        document.getElementById('undo-btn').addEventListener('click', () => this.undoMove());
        document.getElementById('restart-level-btn').addEventListener('click', () => this.restartLevel());
        document.getElementById('level-display').addEventListener('click', () => this.showLevelGrid());

        window.addEventListener('resize', () => this.updateUI());
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
        this.level++;
        this.startGame();
    }

    generateLevel() {
        const totalCells = this.config.boardSize * this.config.boardSize;
        const maxMetas = Math.floor(totalCells / 5);
        const numTargets = Math.max(5, Math.min(this.config.startingMetas + Math.floor((this.level - 1) / this.config.levelToMetasRatio), maxMetas));

        this.walls = [];
        this.targets = [];
        
        // Random walls
        for (let i = 0; i < totalCells * this.config.wallDensity; i++) {
            const wx = Math.floor(Math.random() * this.config.boardSize);
            const wy = Math.floor(Math.random() * this.config.boardSize);
            // Don't put walls in corners or starting pos
            if ((wx===0 && wy===0) || (wx===0 && wy===7) || (wx===7 && wy===0) || (wx===7 && wy===7)) continue;
            if (!this.walls.some(w => w.x === wx && w.y === wy)) {
                this.walls.push({ x: wx, y: wy });
            }
        }

        // Force Player Pos NOT in a wall
        do {
            this.playerPos = {
                x: Math.floor(Math.random() * this.config.boardSize),
                y: Math.floor(Math.random() * this.config.boardSize)
            };
        } while (this.isWall(this.playerPos.x, this.playerPos.y));

        // Mandatory Corners
        const corners = [{x:0,y:0}, {x:0,y:7}, {x:7,y:0}, {x:7,y:7}];
        let currentPos = { ...this.playerPos };
        let remainingCorners = [...corners];

        // We will build a path that visits all corners. 
        // We might need intermediate targets if corners are > 5 steps apart.
        const pathTargets = [];
        
        while (remainingCorners.length > 0) {
            // Pick closest corner
            let closestIdx = -1;
            let minDist = Infinity;
            remainingCorners.forEach((c, idx) => {
                const d = Math.abs(c.x - currentPos.x) + Math.abs(c.y - currentPos.y);
                if (d < minDist) { minDist = d; closestIdx = idx; }
            });

            const targetCorner = remainingCorners.splice(closestIdx, 1)[0];
            
            // Generate steps to reach this corner
            let subPath = this.generateSolvablePath(currentPos, targetCorner);
            if (!subPath) return this.generateLevel(); // Retry if impossible

            subPath.forEach(t => {
                if (!pathTargets.some(pt => pt.x === t.x && pt.y === t.y)) {
                    pathTargets.push({ ...t, collected: false });
                }
            });
            currentPos = { ...targetCorner };
        }

        // Add extra targets if we haven't reached numTargets
        while (pathTargets.length < numTargets) {
             const possible = this.findReachableCells(currentPos, this.config.maxJump);
             const valid = possible.filter(pt => !this.isWall(pt.x, pt.y) && !pathTargets.some(t => t.x === pt.x && t.y === pt.y));
             if (valid.length === 0) break;
             const chosen = valid[Math.floor(Math.random() * valid.length)];
             pathTargets.push({ ...chosen, collected: false });
             currentPos = { ...chosen };
        }

        this.targets = pathTargets;
        this.movesSinceLastTarget = 0;
        this.history = [];
        
        this.initialLevelState = {
            playerPos: { ...this.playerPos },
            targets: JSON.parse(JSON.stringify(this.targets)),
            walls: JSON.parse(JSON.stringify(this.walls))
        };

        this.saveHistory();
        this.renderEntities();
    }

    // Helper to find intermediate points to reach a distant target
    generateSolvablePath(start, end) {
        const pathPoints = [];
        let cur = { ...start };
        
        while (true) {
            const dist = this.getRealDistance(cur, end);
            if (dist === Infinity) return null; // Unreachable
            if (dist <= this.config.maxJump) {
                pathPoints.push({ x: end.x, y: end.y });
                return pathPoints;
            }

            // Need intermediate
            const reachable = this.findReachableCells(cur, this.config.maxJump);
            // Sort by proximity to end
            reachable.sort((a, b) => this.getRealDistance(a, end) - this.getRealDistance(b, end));
            
            if (reachable.length === 0 || this.getRealDistance(reachable[0], end) >= dist) return null;
            
            cur = reachable[0];
            pathPoints.push({ ...cur });
        }
    }

    getRealDistance(start, end) {
        const path = this.getShortestPath(start, end);
        return path ? path.length : Infinity;
    }

    saveHistory() {
        this.history.push({
            playerPos: { ...this.playerPos },
            movesSinceLastTarget: this.movesSinceLastTarget,
            targets: JSON.parse(JSON.stringify(this.targets))
        });
    }

    undoMove() {
        if (this.gameState !== 'PLAYING' || this.history.length <= 1 || this.isAnimating) return;
        this.history.pop();
        const prevState = this.history[this.history.length - 1];
        this.playerPos = { ...prevState.playerPos };
        this.movesSinceLastTarget = prevState.movesSinceLastTarget;
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
        this.movesSinceLastTarget = 0;
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
                this.startGame();
            });
            container.appendChild(square);
        }
        document.getElementById('level-grid-overlay').classList.add('active');
    }

    findReachableCells(start, maxDist) {
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
        });
        this.walls.forEach(w => this.getCell(w.x, w.y).classList.add('wall'));
        this.targets.forEach((t, index) => {
            if (t.collected) return; 
            const cell = this.getCell(t.x, t.y);
            const targetEl = document.createElement('div');
            targetEl.className = 'target';
            targetEl.dataset.index = index;
            // Next target visual deactivated for difficulty
            targetEl.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleTargetClick(t);
            });
            cell.appendChild(targetEl);
        });
    }

    getCell(x, y) { return document.getElementById(`cell-${x}-${y}`); }

    updateUI() {
        this.levelValEl.innerText = this.level;
        this.movesValEl.innerText = `${this.movesSinceLastTarget}/5`;
        
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
        
        // Use BFS path to check distance correctly including walls
        const path = this.getShortestPath(this.playerPos, target);
        const dist = path ? path.length : Infinity;
        
        if (dist <= this.config.maxJump) {
            this.isAnimating = true;
            
            for (const step of path) {
                this.playerPos = { x: step.x, y: step.y };
                this.updateUI();
                await new Promise(r => setTimeout(r, this.config.moveDelay));
            }

            this.movesSinceLastTarget = dist; 
            target.collected = true;
            this.saveHistory();
            this.vibrate([30, 50, 30]);
            this.renderEntities();
            this.updateUI();
            
            this.isAnimating = false;

            if (this.targets.every(t => t.collected)) {
                this.win();
            } else {
                this.checkStuck();
            }
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
        const reachable = remainingTargets.some(t => {
            const path = this.getShortestPath(this.playerPos, t);
            return path && path.length <= this.config.maxJump;
        });

        if (!reachable) {
            this.gameOver("Estás bloqueado: Ninguna meta está a menos de 5 pasos reales.");
        }
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
