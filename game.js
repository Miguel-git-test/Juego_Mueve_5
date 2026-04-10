/**
 * Mueve 5 - Master Edition (v2.5.1)
 * Modes: CLASSIC, PUZZLE, BLITZ, MEMORIA (Parpadeo)
 */

class Game {
    constructor() {
        this.config = {
            boardSize: 8,
            wallDensity: 0.12,
            levelToMetasRatio: 2,
            moveDelay: 100,
            initialJumpBudget: 5,
            blitzBaseTime: 30, 
            blitzMinTime: 10,  // Standard floor is 10s now
            memoriaMaxLevels: 10
        };

        this.data = JSON.parse(localStorage.getItem('mueve5_data')) || {
            gameMode: 'CLASSIC',
            classicLevel: 1,
            puzzleLevel: 1,
            blitzLevel: 1,
            blitzMaxLevel: 1,
            memoriaLevel: 1,
            memoriaMaxLevel: 0,
            secretUnlocked: true // Now public by default
        };

        this.gameMode = this.data.gameMode;
        this.setLevelFromMode();

        this.playerPos = { x: 0, y: 0 };
        this.targets = [];
        this.walls = [];
        this.currentMaxJump = this.config.initialJumpBudget;
        this.gameState = 'START';
        this.isAnimating = false;
        
        this.history = []; 
        this.initialLevelState = null;

        // Blitz Timer
        this.remainingTime = 0; 
        this.timerInterval = null;

        // Memoria Mode State
        this.memoriaPhase = 'NONE'; // FLASH, GUESS, REVEAL
        this.memoriaSelected = [];
        
        this.init();
    }

    setLevelFromMode() {
        if (this.gameMode === 'CLASSIC') this.level = this.data.classicLevel || 1;
        else if (this.gameMode === 'PUZZLE') this.level = this.data.puzzleLevel || 1;
        else if (this.gameMode === 'BLITZ') this.level = this.data.blitzLevel || 1;
        else if (this.gameMode === 'MEMORIA') this.level = this.data.memoriaLevel || 1;
    }

    init() {
        this.boardEl = document.getElementById('board');
        this.playerEl = document.getElementById('player');
        this.levelValEl = document.getElementById('level-val');
        this.movesValEl = document.getElementById('moves-val');
        this.movesLabelEl = document.getElementById('moves-label');
        this.timeStatEl = document.getElementById('time-stat');
        this.timeValEl = document.getElementById('time-val');
        
        this.createBoardElements();
        this.setupEventListeners();
        this.updateModeUI();
        this.handleInstallPrompt();
    }

    savePersistentData() {
        if (this.gameMode === 'CLASSIC') this.data.classicLevel = this.level;
        else if (this.gameMode === 'PUZZLE') this.data.puzzleLevel = this.level;
        else if (this.gameMode === 'BLITZ') {
            this.data.blitzLevel = this.level;
            if (this.level > this.data.blitzMaxLevel) this.data.blitzMaxLevel = this.level;
        } else if (this.gameMode === 'MEMORIA') {
            this.data.memoriaLevel = this.level;
            if (this.level > this.data.memoriaMaxLevel) this.data.memoriaMaxLevel = this.level;
        }
        this.data.gameMode = this.gameMode;
        localStorage.setItem('mueve5_data', JSON.stringify(this.data));
    }

    createBoardElements() {
        this.boardEl.innerHTML = '';
        this.playerEl = document.createElement('div');
        this.playerEl.id = 'player';
        this.boardEl.appendChild(this.playerEl);
        
        let cols = 8, rows = 8;
        if (this.gameMode === 'MEMORIA') { cols = 1; rows = 10; }
        
        document.documentElement.style.setProperty('--grid-cols', cols);
        document.documentElement.style.setProperty('--grid-rows', rows);

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const cell = document.createElement('div');
                cell.className = 'cell';
                cell.id = `cell-${x}-${y}`;
                this.boardEl.appendChild(cell);
            }
        }
    }

    setupEventListeners() {
        document.getElementById('start-btn').onclick = () => this.startGame();
        document.getElementById('next-level-btn').onclick = () => this.nextLevel();
        document.getElementById('restart-btn').onclick = () => this.restartGameFromContext();
        document.getElementById('level-select-btn').onclick = () => this.showLevelGrid();
        document.getElementById('menu-btn').onclick = () => this.showMenu();
        
        document.getElementById('set-classic-mode').onclick = () => this.setMode('CLASSIC');
        document.getElementById('set-puzzle-mode').onclick = () => this.setMode('PUZZLE');
        document.getElementById('set-blitz-mode').onclick = () => this.setMode('BLITZ');
        document.getElementById('set-secret-mode').onclick = () => this.setMode('MEMORIA');

        const unlockOkBtn = document.getElementById('unlock-ok-btn');
        if (unlockOkBtn) unlockOkBtn.onclick = () => this.closeOverlays();

        document.getElementById('final-unlock-ok-btn').onclick = () => this.closeOverlays();

        document.getElementById('close-level-grid').onclick = () => {
            document.getElementById('level-grid-overlay').classList.remove('active');
            if (this.gameState === 'START') document.getElementById('start-overlay').classList.add('active');
        };
        
        document.getElementById('undo-btn').onclick = () => this.undoMove();
        document.getElementById('restart-level-btn').onclick = () => this.restartLevel();
        document.getElementById('level-display').onclick = () => this.showLevelGrid();
    }

    setMode(mode) {
        if (this.isAnimating) return;
        this.gameMode = mode;
        this.setLevelFromMode();
        this.currentMaxJump = this.config.initialJumpBudget;
        this.savePersistentData();
        this.createBoardElements();
        this.updateModeUI();
        this.updateUI();
        this.vibrate(20);
    }

    updateModeUI() {
        const btns = {
            CLASSIC: document.getElementById('set-classic-mode'),
            PUZZLE: document.getElementById('set-puzzle-mode'),
            BLITZ: document.getElementById('set-blitz-mode'),
            MEMORIA: document.getElementById('set-secret-mode')
        };
        
        Object.keys(btns).forEach(m => {
            if (this.gameMode === m) btns[m].classList.add('active');
            else btns[m].classList.remove('active');
        });

        if (this.data.secretUnlocked) btns.MEMORIA.style.display = 'block';

        // Custom label / visuals
        if (this.gameMode === 'PUZZLE') {
            this.movesLabelEl.innerText = 'Salto';
            this.boardEl.classList.remove('classic-mode');
        } else {
            this.movesLabelEl.innerText = 'Pasos';
            this.boardEl.classList.add('classic-mode');
        }

        // Timer stats visibility
        this.timeStatEl.style.display = (this.gameMode === 'BLITZ' || this.gameMode === 'MEMORIA') ? 'flex' : 'none';
        
        document.querySelectorAll('.stat-item').forEach(el => el.classList.remove('active-mode'));
        if (this.gameMode === 'BLITZ' || this.gameMode === 'MEMORIA') this.timeStatEl.classList.add('active-mode');
        else this.movesLabelEl.parentElement.classList.add('active-mode');
    }

    startGame() {
        if (this.isAnimating) return;
        this.gameState = 'PLAYING';
        this.closeOverlays();
        this.createBoardElements(); // Refresh grid layout
        this.generateLevel();
        
        if (this.playerEl) {
            this.playerEl.classList.toggle('active', this.gameMode !== 'MEMORIA');
        }
        
        if (this.gameMode === 'BLITZ') this.startBlitzTimer();
        if (this.gameMode === 'MEMORIA') this.startMemoriaSequence();
        
        this.updateUI();
    }

    generateLevel() {
        this.walls = [];
        this.targets = [];
        this.currentMaxJump = this.config.initialJumpBudget;
        
        if (this.gameMode === 'MEMORIA') {
            this.generateSecretLevel();
            return;
        }

        const boardSize = 8;
        const totalCells = boardSize * boardSize;

        // Walls
        for (let i = 0; i < totalCells * this.config.wallDensity; i++) {
            const wx = Math.floor(Math.random() * boardSize);
            const wy = Math.floor(Math.random() * boardSize);
            if ((wx===0 && wy===0) || (wx===0 && wy===7) || (wx===7 && wy===0) || (wx===7 && wy===7)) continue;
            if (!this.walls.some(w => w.x === wx && w.y === wy)) this.walls.push({ x: wx, y: wy });
        }

        // Player Pos
        do {
            this.playerPos = { x: Math.floor(Math.random() * 8), y: Math.floor(Math.random() * 8) };
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

        // Deception (Puzzle only)
        if (this.gameMode === 'PUZZLE') {
            // Trap at start
            const first = this.targets[0];
            const dist = this.getShortestPath(this.playerPos, first)?.length || 99;
            const traps = this.findReachableCells(this.playerPos, dist - 1).filter(pt => !this.isWall(pt.x, pt.y) && !this.targets.some(t => t.x === pt.x && t.y === pt.y));
            if (traps.length > 0) this.targets.push({ ...traps[Math.floor(Math.random() * traps.length)], collected: false, value: 2 });
        }

        // Metas fill
        const metasCount = this.gameMode === 'BLITZ' ? 15 : Math.min(15, 5 + Math.floor(this.level / 2));
        while (this.targets.length < metasCount) {
            const source = this.targets[Math.floor(Math.random() * this.targets.length)];
            const budget = (this.gameMode === 'PUZZLE') ? source.value : 5;
            const valid = this.findReachableCells(source, budget).filter(pt => 
                !this.isWall(pt.x, pt.y) && 
                !this.targets.some(t => t.x === pt.x && t.y === pt.y) &&
                !(pt.x === this.playerPos.x && pt.y === this.playerPos.y)
            );
            if (valid.length === 0) break;
            this.targets.push({ ...valid[Math.floor(Math.random() * valid.length)], collected: false, value: (this.gameMode === 'PUZZLE' ? 2 : 5) });
        }

        this.history = [];
        this.initialLevelState = { playerPos: {...this.playerPos}, targets: JSON.parse(JSON.stringify(this.targets)) };
        this.renderEntities();
    }

    generateSecretLevel() {
        this.targets = [];
        this.memoriaSelected = [];
        const possibleRows = Array.from({length: 9}, (_, i) => i + 1); // 1 to 9 (not 0)
        possibleRows.sort(() => 0.5 - Math.random());
        for (let i = 0; i < 3; i++) {
            this.targets.push({ x: 0, y: possibleRows[i], collected: false });
        }
        this.renderEntities();
    }

    async startMemoriaSequence() {
        this.memoriaPhase = 'FLASH';
        this.renderEntities();
        
        const exposureTime = Math.max(100, 1500 * Math.pow(0.8, this.level - 1));
        this.remainingTime = Math.floor(exposureTime / 100);
        this.updateTimerUI();

        await new Promise(r => setTimeout(r, exposureTime));
        
        this.memoriaPhase = 'GUESS';
        this.renderEntities();
        this.vibrate(50);
    }

    startBlitzTimer() {
        this.stopBlitzTimer();
        const baseSeconds = Math.max(this.config.blitzMinTime, this.config.blitzBaseTime - (this.level - 1));
        
        // UNLOCK DETECTION REMOVED - Parpadeo is now public

        this.remainingTime = baseSeconds * 10;
        this.updateTimerUI();
        this.timerInterval = setInterval(() => {
            if (this.gameState !== 'PLAYING' || this.isAnimating) return;
            this.remainingTime--;
            this.updateTimerUI();
            if (this.remainingTime <= 0) {
                this.stopBlitzTimer();
                this.gameOver("¡Se acabó el tiempo!");
            }
        }, 100);
    }

    stopBlitzTimer() {
        if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    }

    updateTimerUI() {
        const val = this.gameMode === 'MEMORIA' ? (this.remainingTime / 10).toFixed(0) : (this.remainingTime / 10).toFixed(1);
        this.timeValEl.innerText = val;
        this.timeValEl.classList.toggle('emergency', this.remainingTime <= 50);
    }

    renderEntities() {
        document.querySelectorAll('.cell').forEach(c => {
            c.classList.remove('wall', 'secret-correct', 'secret-wrong');
            c.innerHTML = '';
            c.onclick = null;
        });

        this.walls.forEach(w => this.getCell(w.x, w.y).classList.add('wall'));
        
        this.targets.forEach((t, idx) => {
            if (t.collected) return;
            const cell = this.getCell(t.x, t.y);
            const targetEl = document.createElement('div');
            targetEl.className = 'target';
            
            if (this.gameMode === 'MEMORIA' && this.memoriaPhase === 'GUESS') {
                targetEl.classList.add('hidden');
            }
            
            targetEl.dataset.value = t.value || '';
            cell.appendChild(targetEl);
        });

        // Click listeners
        const rows = (this.gameMode === 'MEMORIA') ? 10 : 8;
        const cols = (this.gameMode === 'MEMORIA') ? 1 : 8;
        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const cell = this.getCell(x, y);
                cell.onclick = () => this.handleCellClick(x, y);
            }
        }
    }

    handleCellClick(x, y) {
        if (this.gameState !== 'PLAYING' || this.isAnimating) return;
        
        if (this.gameMode === 'MEMORIA') {
            if (this.memoriaPhase !== 'GUESS') return;
            const targetIdx = this.targets.findIndex(t => t.x === x && t.y === y && !t.collected);
            const cell = this.getCell(x, y);
            
            if (targetIdx !== -1) {
                this.targets[targetIdx].collected = true;
                cell.classList.add('secret-correct');
                cell.innerHTML = '<div class="target"></div>';
                this.vibrate(20);
                if (this.targets.every(t => t.collected)) this.win();
            } else {
                cell.classList.add('secret-wrong');
                this.vibrate(100);
                setTimeout(() => this.gameOver("Memoria fallida"), 500);
            }
        } else {
            const target = this.targets.find(t => t.x === x && t.y === y && !t.collected);
            if (target) this.handleTargetMovement(target);
        }
    }

    async handleTargetMovement(target) {
        const path = this.getShortestPath(this.playerPos, target);
        const budget = (this.gameMode === 'PUZZLE') ? this.currentMaxJump : 5;
        if (path && path.length <= budget) {
            this.isAnimating = true;
            for (const step of path) {
                this.playerPos = { x: step.x, y: step.y };
                this.updateUI();
                await new Promise(r => setTimeout(r, this.config.moveDelay));
            }
            if (this.gameMode === 'PUZZLE') this.currentMaxJump = target.value;
            target.collected = true;
            this.history.push({ playerPos: {...this.playerPos}, targets: JSON.parse(JSON.stringify(this.targets)) });
            this.renderEntities();
            this.updateUI();
            this.isAnimating = false;
            if (this.targets.every(t => t.collected)) this.win();
        } else {
            const cell = this.getCell(target.x, target.y);
            cell.classList.add('invalid-move-flash');
            setTimeout(() => cell.classList.remove('invalid-move-flash'), 300);
        }
    }

    win() {
        this.stopBlitzTimer();
        this.gameState = 'WIN';
        document.getElementById('win-overlay').classList.add('active');
    }

    nextLevel() {
        if (this.level < 100) this.level++;
        this.savePersistentData();
        this.startGame();
    }

    gameOver(reason) {
        this.stopBlitzTimer();
        this.gameState = 'LOSE';
        document.getElementById('lose-reason').innerText = reason;
        document.getElementById('lose-overlay').classList.add('active');
    }

    restartGameFromContext() {
        if (this.gameMode === 'BLITZ') this.level = Math.floor((this.level - 1) / 5) * 5 + 1;
        if (this.gameMode === 'MEMORIA') this.level = 1;
        this.startGame();
    }

    restartLevel() {
        this.playerPos = {...this.initialLevelState.playerPos};
        this.targets = JSON.parse(JSON.stringify(this.initialLevelState.targets));
        this.startGame();
    }

    updateUI() {
        this.levelValEl.innerText = this.level;
        this.movesValEl.innerText = (this.gameMode === 'PUZZLE') ? this.currentMaxJump : 5;
        const cell = this.getCell(this.playerPos.x, this.playerPos.y);
        if (cell && this.playerEl && this.gameMode !== 'MEMORIA') {
            this.playerEl.style.left = `${cell.offsetLeft + cell.offsetWidth/2}px`;
            this.playerEl.style.top = `${cell.offsetTop + cell.offsetHeight/2}px`;
        }
    }

    getCell(x, y) { return document.getElementById(`cell-${x}-${y}`); }
    isWall(x, y) { return this.walls.some(w => w.x === x && w.y === y); }

    getShortestPath(start, end) {
        if (start.x === end.x && start.y === end.y) return [];
        const queue = [[start]], visited = new Set([`${start.x},${start.y}`]);
        while (queue.length > 0) {
            const path = queue.shift(), { x, y } = path[path.length - 1];
            if (x === end.x && y === end.y) return path.slice(1);
            [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}].forEach(o => {
                const nx = x + o.x, ny = y + o.y;
                if (nx>=0 && nx<8 && ny>=0 && ny<8 && !visited.has(`${nx},${ny}`) && !this.isWall(nx, ny)) {
                    visited.add(`${nx},${ny}`);
                    queue.push([...path, {x:nx, y:ny}]);
                }
            });
        }
        return null;
    }

    findReachableCells(start, max) {
        const res = [], q = [{x:start.x, y:start.y, d:0}], v = new Set([`${start.x},${start.y}`]);
        while(q.length > 0) {
            const {x, y, d} = q.shift();
            if (d > 0 && d <= max) res.push({x, y});
            if (d < max) [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}].forEach(o => {
                const nx = x+o.x, ny = y+o.y;
                if (nx>=0 && nx<8 && ny>=0 && ny<8 && !v.has(`${nx},${ny}`) && !this.isWall(nx, ny)) {
                    v.add(`${nx},${ny}`); q.push({x:nx, y:ny, d:d+1});
                }
            });
        }
        return res;
    }

    constructBackboneSegment(s, e, b, bb) {
        let cur = {...s}, cB = b;
        while(true) {
            const p = this.getShortestPath(cur, e);
            if (!p) return null;
            if (p.length <= cB && p.length > 0) {
                const nB = (this.gameMode ==='PUZZLE') ? Math.floor(Math.random()*3)+3 : 5;
                const t = {...e, collected: false, value: nB};
                if (!bb.some(x => x.x===e.x && x.y===e.y)) bb.push(t);
                return {newPos: t, newBudget: nB};
            }
            const r = this.findReachableCells(cur, cB).filter(pt => !this.isWall(pt.x, pt.y) && !bb.some(x => x.x===pt.x && x.y===pt.y));
            if (r.length === 0) return null;
            r.sort((a,b) => (this.getShortestPath(a, e)?.length || 99) - (this.getShortestPath(b, e)?.length || 99));
            const nB = (this.gameMode ==='PUZZLE') ? Math.floor(Math.random()*3)+3 : 5;
            const inter = {...r[0], collected: false, value: nB};
            bb.push(inter); cur = {...inter}; cB = nB;
        }
    }

    showLevelGrid() {
        this.closeOverlays();
        const container = document.getElementById('level-grid-container');
        container.innerHTML = '';
        const limit = (this.gameMode === 'BLITZ') ? this.data.blitzMaxLevel : 100;
        for (let i = 1; i <= limit; i++) {
            if (this.gameMode === 'BLITZ' && (i-1)%5 !== 0 && i !== this.level) continue;
            const sq = document.createElement('div');
            sq.className = 'level-square' + (i === this.level ? ' current' : '');
            sq.innerText = i;
            sq.onclick = () => { this.level = i; this.savePersistentData(); this.startGame(); };
            container.appendChild(sq);
        }
        document.getElementById('level-grid-overlay').classList.add('active');
    }

    showMenu() { this.gameState = 'START'; this.closeOverlays(); document.getElementById('start-overlay').classList.add('active'); this.updateModeUI(); }
    closeOverlays() { document.querySelectorAll('.overlay').forEach(o => o.classList.remove('active')); }
    vibrate(p) { if(navigator.vibrate) navigator.vibrate(p); }
    handleInstallPrompt() {
        let dp; const btn = document.getElementById('install-button');
        window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); dp = e; btn.style.display = 'block'; });
        btn.onclick = async () => { if (dp) { dp.prompt(); const { outcome } = await dp.userChoice; if (outcome === 'accepted') btn.style.display = 'none'; dp = null; } };
    }
}
window.addEventListener('DOMContentLoaded', () => { new Game(); });
