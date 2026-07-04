// Game State
let currentLang = 'th'; // Default to Thai
let soundEnabled = true;
let currentLevel = 1; // 1 to 100
let completedLevels = []; // array of level numbers completed
let skippedLevels = []; // array of level numbers skipped

// Curated 100 level hands loaded from solver
let towerLevels = []; // array of { level, numbers: [a,b,c,d], solutions: [], requiresFractions: false, diffScore: 0 }

// Active Gameplay State
let originalNumbers = [];
let currentSolutions = [];
let tiles = []; // array of { id, val, str }
let selectedTileId = null;
let selectedOperator = null;
let history = []; // stack of states for undo
let nextTileId = 100;

// Audio Context and Synth Sound Effects
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new AudioCtx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

const sounds = {
  click() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch (e) { console.warn(e); }
  },
  
  select() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(329.63, ctx.currentTime); // E4
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) { console.warn(e); }
  },

  success() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const playTone = (freq, startOffset, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + startOffset);
        gain.gain.setValueAtTime(0.08, ctx.currentTime + startOffset);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startOffset + duration);
        osc.start(ctx.currentTime + startOffset);
        osc.stop(ctx.currentTime + startOffset + duration);
      };
      // C Major Arpeggio
      playTone(523.25, 0, 0.12);    // C5
      playTone(659.25, 0.08, 0.12); // E5
      playTone(783.99, 0.16, 0.12); // G5
      playTone(1046.50, 0.24, 0.35); // C6
    } catch (e) { console.warn(e); }
  },

  error() {
    if (!soundEnabled) return;
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(90, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch (e) { console.warn(e); }
  }
};

// Bilingual Strings Dictionary
const DYNAMIC_STRINGS = {
  en: {
    selectStart: "Select a tile to start",
    selectOp: "Select an operator (+, -, ×, ÷)",
    selectSecond: "Select another tile to calculate",
    cantUndo: "Nothing to undo!",
    cantReset: "Board is already in original state",
    toastHint: "Hint: Try starting with: {step}",
    notQuite24: "Final tile is {val}, not 24. Try again!",
    solutionsFound: "Found {n} solutions",
    noSolutions: "No solutions found.",
    cantDivideZero: "Cannot divide by zero!",
    levelCleared: "Floor {level} Cleared!",
    skipConfirm: "Level skipped! Ascending to next floor.",
    solvedCount: "{n} / 100 Cleared"
  },
  th: {
    selectStart: "เลือกการ์ดตัวเลขเพื่อเริ่มต้น",
    selectOp: "เลือกเครื่องหมายคำนวณ (+, -, ×, ÷)",
    selectSecond: "เลือกตัวเลขอีกใบเพื่อเริ่มคำนวณ",
    cantUndo: "ไม่มีขั้นตอนให้ย้อนกลับ!",
    cantReset: "กระดานอยู่ในสถานะเริ่มต้นแล้ว",
    toastHint: "คำใบ้: ลองเริ่มคำนวณจาก: {step}",
    notQuite24: "ผลลัพธ์สุดท้ายคือ {val} ยังไม่ใช่ 24 ลองใหม่อีกครั้งนะ!",
    solutionsFound: "พบวิธีคิด {n} วิธี",
    noSolutions: "ไม่มีวิธีคิดให้ได้ 24 สำหรับเลขชุดนี้",
    cantDivideZero: "ไม่สามารถหารด้วยศูนย์ได้!",
    levelCleared: "ผ่านหอคอยชั้นที่ {level} สำเร็จ!",
    skipConfirm: "ข้ามด่านนี้แล้ว! กำลังขึ้นไปชั้นถัดไป",
    solvedCount: "พิชิตแล้ว {n} / 100 ด่าน"
  }
};

function getDynamicStr(key, replaceObj = {}) {
  let str = DYNAMIC_STRINGS[currentLang][key] || key;
  for (const [k, v] of Object.entries(replaceObj)) {
    str = str.replace(`{${k}}`, v);
  }
  return str;
}

// 24 Extended Solver that detects if fractions are mandatory
function solve24Extended(numbers) {
  const solutions = new Set();
  let hasIntegerSolution = false;
  
  function helper(arr) {
    if (arr.length === 1) {
      if (Math.abs(arr[0].val - 24) < 1e-6) {
        let clean = arr[0].str;
        if (clean.startsWith('(') && clean.endsWith(')')) {
          let depth = 0;
          let fullyEnclosed = true;
          for (let i = 0; i < clean.length - 1; i++) {
            if (clean[i] === '(') depth++;
            else if (clean[i] === ')') depth--;
            if (depth === 0) {
              fullyEnclosed = false;
              break;
            }
          }
          if (fullyEnclosed) {
            clean = clean.slice(1, -1);
          }
        }
        solutions.add(clean);
        if (arr[0].isInt) {
          hasIntegerSolution = true;
        }
      }
      return;
    }
    
    for (let i = 0; i < arr.length; i++) {
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue;
        
        const nextArr = [];
        for (let k = 0; k < arr.length; k++) {
          if (k !== i && k !== j) nextArr.push(arr[k]);
        }
        
        const a = arr[i];
        const b = arr[j];
        
        // Add
        nextArr.push({ 
          val: a.val + b.val, 
          str: `(${a.str} + ${b.str})`, 
          isInt: a.isInt && b.isInt 
        });
        helper(nextArr);
        nextArr.pop();
        
        // Subtract
        nextArr.push({ 
          val: a.val - b.val, 
          str: `(${a.str} - ${b.str})`, 
          isInt: a.isInt && b.isInt 
        });
        helper(nextArr);
        nextArr.pop();
        
        // Multiply
        nextArr.push({ 
          val: a.val * b.val, 
          str: `(${a.str} * ${b.str})`, 
          isInt: a.isInt && b.isInt 
        });
        helper(nextArr);
        nextArr.pop();
        
        // Divide
        if (Math.abs(b.val) > 1e-9) {
          const divisionIsInt = a.isInt && b.isInt && (Number.isInteger(a.val) && Number.isInteger(b.val) && (a.val % b.val === 0));
          nextArr.push({ 
            val: a.val / b.val, 
            str: `(${a.str} / ${b.str})`, 
            isInt: divisionIsInt 
          });
          helper(nextArr);
          nextArr.pop();
        }
      }
    }
  }
  
  const initial = numbers.map(n => ({ val: n, str: n.toString(), isInt: true }));
  helper(initial);
  
  return {
    solutions: Array.from(solutions),
    hasIntegerSolution
  };
}

// Build and Rank 100 Deterministic Levels
function buildTowerDatabase() {
  const solvableHands = [];
  
  // Iterate through combinations with replacement (1 to 10)
  for (let a = 1; a <= 10; a++) {
    for (let b = a; b <= 10; b++) {
      for (let c = b; c <= 10; c++) {
        for (let d = c; d <= 10; d++) {
          const numbers = [a, b, c, d];
          const res = solve24Extended(numbers);
          if (res.solutions.length > 0) {
            // Difficulty Scoring Formula
            const solCount = res.solutions.length;
            const requiresFractions = !res.hasIntegerSolution;
            
            // Fewer solutions = harder. Limit denominator effect
            let diffScore = 50 / Math.min(solCount, 10);
            
            // fractions are extremely hard
            if (requiresFractions) {
              diffScore += 45;
            }
            
            // size increases mental calculation difficulty slightly
            const meanSize = (a + b + c + d) / 4;
            diffScore += meanSize;
            
            solvableHands.push({
              numbers,
              solutions: res.solutions,
              requiresFractions,
              diffScore
            });
          }
        }
      }
    }
  }
  
  // Sort solvable hands by difficulty ascending
  solvableHands.sort((x, y) => x.diffScore - y.diffScore);
  
  // Select exactly 100 levels uniformly
  towerLevels = [];
  const totalSolvable = solvableHands.length;
  for (let i = 0; i < 100; i++) {
    // Distribute indexes evenly across the sorted range
    const index = Math.floor(i * (totalSolvable / 100));
    const hand = solvableHands[index];
    towerLevels.push({
      level: i + 1,
      numbers: hand.numbers,
      solutions: hand.solutions,
      requiresFractions: hand.requiresFractions,
      diffScore: hand.diffScore
    });
  }
}

// Format decimals neatly
function formatNumber(val) {
  if (Number.isInteger(val)) return val.toString();
  if (Math.abs(val - Math.round(val)) < 1e-9) {
    return Math.round(val).toString();
  }
  return val.toFixed(2);
}

// Toggle sound
function setupSound() {
  const soundBtn = document.getElementById('sound-btn');
  const soundOnIcon = soundBtn.querySelector('.sound-on-icon');
  const soundOffIcon = soundBtn.querySelector('.sound-off-icon');

  const savedSound = localStorage.getItem('24tower_sound');
  if (savedSound !== null) {
    soundEnabled = savedSound === 'true';
  }

  const updateIcons = () => {
    if (soundEnabled) {
      soundOnIcon.classList.remove('hidden');
      soundOffIcon.classList.add('hidden');
    } else {
      soundOnIcon.classList.add('hidden');
      soundOffIcon.classList.remove('hidden');
    }
  };

  updateIcons();

  soundBtn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('24tower_sound', soundEnabled);
    updateIcons();
    sounds.click();
  });
}

// Switch Language
function setupLanguage() {
  const langBtn = document.getElementById('lang-btn');
  
  const savedLang = localStorage.getItem('24tower_lang');
  if (savedLang) {
    currentLang = savedLang;
  }

  const updateLanguageDOM = () => {
    const elements = document.querySelectorAll('[data-en]');
    elements.forEach(el => {
      el.textContent = el.getAttribute(`data-${currentLang}`);
    });
    langBtn.textContent = currentLang === 'en' ? 'TH' : 'EN';
    
    // Update zone banner title translations
    updateZoneMeta();
    updateFormulaDisplay();
  };

  updateLanguageDOM();

  langBtn.addEventListener('click', () => {
    currentLang = currentLang === 'en' ? 'th' : 'en';
    localStorage.setItem('24tower_lang', currentLang);
    updateLanguageDOM();
    sounds.click();
  });
}

// Background Floating Particles
function setupParticles() {
  const container = document.getElementById('bg-particles');
  const numParticles = 18;
  
  for (let i = 0; i < numParticles; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    const size = Math.random() * 120 + 30;
    const startX = Math.random() * 100;
    const duration = Math.random() * 20 + 20;
    const drift = Math.random() * 200 - 100;
    const delay = Math.random() * -25;
    
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.left = `${startX}vw`;
    particle.style.setProperty('--duration', `${duration}s`);
    particle.style.setProperty('--drift', `${drift}px`);
    particle.style.animationDelay = `${delay}s`;
    
    container.appendChild(particle);
  }
}

// Load level progress from localStorage
function loadProgress() {
  const savedLevel = localStorage.getItem('24tower_current_level');
  if (savedLevel) {
    currentLevel = parseInt(savedLevel);
  }

  const savedCompleted = localStorage.getItem('24tower_completed_levels');
  if (savedCompleted) {
    completedLevels = JSON.parse(savedCompleted);
  }

  const savedSkipped = localStorage.getItem('24tower_skipped_levels');
  if (savedSkipped) {
    skippedLevels = JSON.parse(savedSkipped);
  }
  
  updateStatsHeader();
}

function saveProgress() {
  localStorage.setItem('24tower_current_level', currentLevel);
  localStorage.setItem('24tower_completed_levels', JSON.stringify(completedLevels));
  localStorage.setItem('24tower_skipped_levels', JSON.stringify(skippedLevels));
  updateStatsHeader();
}

function updateStatsHeader() {
  const statsLabel = document.getElementById('climb-stats');
  statsLabel.textContent = `${completedLevels.length} / 100`;
  
  // Progress Bar update
  const fill = document.getElementById('progress-fill');
  const percent = (completedLevels.length / 100) * 100;
  fill.style.width = `${percent}%`;
}

// Get the Zone ID (1 to 4) based on level number
function getZoneId(lvl) {
  if (lvl <= 20) return 1;
  if (lvl <= 50) return 2;
  if (lvl <= 80) return 3;
  return 4;
}

const ZONE_DETAILS = {
  1: {
    en: { title: "Zone 1: The Training Grounds", desc: "Base floors - Integer calculations only" },
    th: { title: "โซน 1: ลานฝึกหัด", desc: "ด่านเริ่มต้น - การคำนวณเลขลงตัว ไม่ใช้ทศนิยม" }
  },
  2: {
    en: { title: "Zone 2: The Archive Rooms", desc: "Mid floors - Basic divisions & combinations" },
    th: { title: "โซน 2: ห้องเก็บเอกสาร", desc: "ด่านระดับกลาง - เริ่มสลับคู่อันดับคำนวณขั้นพื้นฐาน" }
  },
  3: {
    en: { title: "Zone 3: The Alchemist Labs", desc: "High floors - Fractional steps introduced" },
    th: { title: "โซน 3: ห้องแล็บแปรธาตุ", desc: "ด่านระดับสูง - บังคับหาผลลัพธ์เศษส่วนในขั้นกลาง" }
  },
  4: {
    en: { title: "Zone 4: The Sky Temple", desc: "The Summit - Expert equations, single solutions only" },
    th: { title: "โซน 4: วิหารลอยฟ้า", desc: "ด่านระดับเซียน - โจทย์ยากมาก มีเฉลยเพียงแบบเดียวเท่านั้น" }
  }
};

function updateZoneMeta() {
  const zoneId = getZoneId(currentLevel);
  const data = ZONE_DETAILS[zoneId][currentLang];
  
  document.getElementById('zone-title').textContent = data.title;
  document.getElementById('zone-difficulty').textContent = data.desc;
  document.getElementById('level-badge').textContent = `Lvl ${currentLevel}`;
  
  // Shift body theme colors
  document.body.className = `zone-${zoneId}-theme`;
}

// Render Level Cards in Left Sidebar
function populateTowerMap() {
  const mapContainer = document.getElementById('tower-map');
  mapContainer.innerHTML = '';
  
  // Levels climb UP: display in reverse order (100 down to 1)
  for (let i = 100; i >= 1; i--) {
    const node = document.createElement('div');
    node.className = 'level-node';
    node.setAttribute('data-level', i);
    node.setAttribute('data-zone', getZoneId(i));
    
    // Check lock state: level N is unlocked if N is 1, or N-1 is completed or skipped.
    const isUnlocked = i === 1 || completedLevels.includes(i - 1) || skippedLevels.includes(i - 1);
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'level-info';
    
    const titleSpan = document.createElement('span');
    titleSpan.className = 'level-title';
    titleSpan.textContent = `Floor ${i}`;
    
    const zoneSpan = document.createElement('span');
    zoneSpan.className = 'level-zone-name';
    // Zone name snippet
    const zoneId = getZoneId(i);
    zoneSpan.textContent = currentLang === 'en' ? `Zone ${zoneId}` : `โซน ${zoneId}`;
    
    infoDiv.appendChild(titleSpan);
    infoDiv.appendChild(zoneSpan);
    node.appendChild(infoDiv);
    
    const statusIcon = document.createElement('div');
    statusIcon.className = 'level-status-icon';
    
    if (!isUnlocked) {
      node.classList.add('locked');
      // Lock Icon
      statusIcon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z"/></svg>`;
    } else {
      if (completedLevels.includes(i)) {
        node.classList.add('completed');
        // Checkmark
        statusIcon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/></svg>`;
      } else if (i === currentLevel) {
        node.classList.add('active');
        // Target / Glow marker
        statusIcon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12,2A10,10 0 1,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 1,1 4,12A8,8 0 0,1 12,4M12,6A6,6 0 1,0 18,12A6,6 0 0,0 12,6M12,8A4,4 0 1,1 8,12A4,4 0 0,1 12,8M12,10A2,2 0 1,0 14,12A2,2 0 0,0 12,10Z"/></svg>`;
      } else {
        // Unlocked but unplayed/skipped
        if (skippedLevels.includes(i)) {
          // Arrow pointing right
          statusIcon.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8.59,16.59L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.59Z"/></svg>`;
        } else {
          // Simple dot indicating unplayed but playable
          statusIcon.innerHTML = `<svg viewBox="0 0 24 24" width="8" height="8" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg>`;
        }
      }
      
      // Node click listener to load level
      node.addEventListener('click', () => {
        sounds.click();
        loadLevel(i);
        
        // Auto-close sidebar on mobile after clicking
        const sidebar = document.getElementById('tower-sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        if (sidebar.classList.contains('open')) {
          sidebar.classList.remove('open');
          if (overlay) overlay.classList.remove('visible');
        }
      });
    }
    
    mapContainer.appendChild(node);
  }
}

// Scroll tower sidebar automatically to center the current active level card
function centerActiveLevelInSidebar() {
  const container = document.getElementById('tower-map');
  const activeNode = container.querySelector(`.level-node.active`);
  if (activeNode) {
    // Wait briefly for DOM to fully update layout
    setTimeout(() => {
      const parentRect = container.getBoundingClientRect();
      const nodeRect = activeNode.getBoundingClientRect();
      
      // Calculate scroll offset to center node
      const scrollOffset = (nodeRect.top - parentRect.top) - (parentRect.height / 2) + (nodeRect.height / 2);
      container.scrollTop += scrollOffset;
    }, 100);
  }
}

// Load a specific Level hand
function loadLevel(levelNum) {
  currentLevel = levelNum;
  const levelData = towerLevels.find(l => l.level === levelNum);
  
  if (!levelData) return;
  
  originalNumbers = [...levelData.numbers];
  currentSolutions = levelData.solutions;
  
  // Set up original tiles
  tiles = originalNumbers.map((n, i) => ({
    id: i,
    val: n,
    str: n.toString()
  }));
  
  selectedTileId = null;
  selectedOperator = null;
  history = [];
  
  // Re-render Game Area
  renderBoard();
  updateActionButtonStates();
  updateFormulaDisplay();
  updateZoneMeta();
  
  // Update sidebar selection
  const nodes = document.querySelectorAll('.level-node');
  nodes.forEach(n => {
    const l = parseInt(n.getAttribute('data-level'));
    n.classList.remove('active');
    if (l === levelNum) {
      n.classList.add('active');
    }
  });
  
  // Redraw icons and locks
  populateTowerMap();
  saveProgress();
}

function renderBoard() {
  const tilesArea = document.getElementById('tiles-area');
  tilesArea.innerHTML = '';
  
  tiles.forEach(tile => {
    const card = document.createElement('div');
    card.className = 'tile-card new-spawn';
    if (tile.id === selectedTileId) {
      card.classList.add('selected');
    }
    
    card.addEventListener('click', () => handleTileClick(tile.id));
    
    const inner = document.createElement('div');
    inner.className = 'tile-inner';
    
    const numSpan = document.createElement('span');
    numSpan.className = 'tile-num';
    numSpan.textContent = formatNumber(tile.val);
    
    const histSpan = document.createElement('span');
    histSpan.className = 'tile-history';
    histSpan.textContent = tile.str;
    
    inner.appendChild(numSpan);
    inner.appendChild(histSpan);
    card.appendChild(inner);
    tilesArea.appendChild(card);
  });
}

function handleTileClick(id) {
  const clickedTile = tiles.find(t => t.id === id);
  if (!clickedTile) return;
  
  sounds.select();

  if (selectedTileId === null) {
    selectedTileId = id;
  } else if (selectedTileId === id) {
    selectedTileId = null;
  } else if (selectedOperator !== null) {
    mergeTiles(selectedTileId, clickedTile.id, selectedOperator);
  } else {
    selectedTileId = id;
  }
  
  updateOperatorSelection();
  renderBoard();
  updateFormulaDisplay();
}

function handleOperatorClick(op) {
  if (selectedTileId === null) {
    sounds.error();
    return;
  }
  
  sounds.select();
  selectedOperator = selectedOperator === op ? null : op;
  
  updateOperatorSelection();
  updateFormulaDisplay();
}

function updateOperatorSelection() {
  const buttons = document.querySelectorAll('.op-btn');
  buttons.forEach(btn => {
    if (btn.getAttribute('data-op') === selectedOperator) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });
}

function updateFormulaDisplay() {
  const display = document.getElementById('formula-display');
  
  if (selectedTileId === null) {
    display.textContent = getDynamicStr('selectStart');
    display.className = 'formula-hint-text';
  } else {
    const tile = tiles.find(t => t.id === selectedTileId);
    const tileValText = formatNumber(tile.val);
    
    if (selectedOperator === null) {
      display.textContent = `${tileValText} ... ?`;
      display.className = 'formula-hint-active';
    } else {
      const displayOp = selectedOperator === '*' ? '×' : (selectedOperator === '/' ? '÷' : selectedOperator);
      display.textContent = `${tileValText} ${displayOp} ... ?`;
      display.className = 'formula-hint-active';
    }
  }
}

function mergeTiles(idA, idB, op) {
  const tileA = tiles.find(t => t.id === idA);
  const tileB = tiles.find(t => t.id === idB);
  
  if (!tileA || !tileB) return;
  
  if (op === '/' && Math.abs(tileB.val) < 1e-9) {
    sounds.error();
    const cards = document.querySelectorAll('.tile-card');
    tiles.forEach((t, index) => {
      if (t.id === idB) {
        cards[index].classList.add('shake');
        setTimeout(() => cards[index].classList.remove('shake'), 400);
      }
    });
    alert(getDynamicStr('cantDivideZero'));
    return;
  }
  
  history.push(JSON.parse(JSON.stringify(tiles)));
  
  let newVal = 0;
  let newStr = '';
  
  switch (op) {
    case '+':
      newVal = tileA.val + tileB.val;
      newStr = `(${tileA.str} + ${tileB.str})`;
      break;
    case '-':
      newVal = tileA.val - tileB.val;
      newStr = `(${tileA.str} - ${tileB.str})`;
      break;
    case '*':
      newVal = tileA.val * tileB.val;
      newStr = `(${tileA.str} * ${tileB.str})`;
      break;
    case '/':
      newVal = tileA.val / tileB.val;
      newStr = `(${tileA.str} / ${tileB.str})`;
      break;
  }
  
  const newTile = {
    id: nextTileId++,
    val: newVal,
    str: newStr
  };
  
  tiles = tiles.filter(t => t.id !== idA && t.id !== idB);
  tiles.push(newTile);
  
  selectedTileId = null;
  selectedOperator = null;
  
  sounds.click();
  renderBoard();
  updateActionButtonStates();
  updateFormulaDisplay();
  
  checkGameEndCondition();
}

function checkGameEndCondition() {
  if (tiles.length === 1) {
    const finalTile = tiles[0];
    if (Math.abs(finalTile.val - 24) < 1e-6) {
      handleSuccess(finalTile.str);
    } else {
      sounds.error();
      const cards = document.querySelectorAll('.tile-card');
      if (cards.length > 0) {
        cards[0].classList.add('shake');
        setTimeout(() => cards[0].classList.remove('shake'), 400);
      }
      
      const display = document.getElementById('formula-display');
      display.textContent = getDynamicStr('notQuite24', { val: formatNumber(finalTile.val) });
      display.className = 'formula-hint-text';
    }
  }
}

function handleSuccess(winningFormula) {
  sounds.success();
  
  const formattedFormula = winningFormula
    .replace(/\*/g, ' × ')
    .replace(/\//g, ' ÷ ')
    .replace(/^\((.*)\)$/, '$1');
  
  document.getElementById('success-formula').textContent = `${formattedFormula} = 24`;
  document.getElementById('success-header').textContent = getDynamicStr('levelCleared', { level: currentLevel });
  
  // Mark completed
  if (!completedLevels.includes(currentLevel)) {
    completedLevels.push(currentLevel);
    // Remove from skipped list if it was there
    skippedLevels = skippedLevels.filter(lvl => lvl !== currentLevel);
  }
  
  saveProgress();
  populateTowerMap();
  
  document.getElementById('success-screen').classList.remove('hidden');
}

function updateActionButtonStates() {
  document.getElementById('undo-btn').disabled = history.length === 0;
  document.getElementById('reset-btn').disabled = history.length === 0;
}

// Game Action Buttons
function undoAction() {
  if (history.length > 0) {
    tiles = history.pop();
    selectedTileId = null;
    selectedOperator = null;
    sounds.click();
    renderBoard();
    updateOperatorSelection();
    updateActionButtonStates();
    updateFormulaDisplay();
  } else {
    alert(getDynamicStr('cantUndo'));
  }
}

function resetAction() {
  if (history.length > 0) {
    sounds.click();
    tiles = originalNumbers.map((n, i) => ({
      id: i,
      val: n,
      str: n.toString()
    }));
    selectedTileId = null;
    selectedOperator = null;
    history = [];
    renderBoard();
    updateOperatorSelection();
    updateActionButtonStates();
    updateFormulaDisplay();
  } else {
    alert(getDynamicStr('cantReset'));
  }
}

function skipLevel() {
  sounds.click();
  
  // Add to skipped list if not already completed
  if (!completedLevels.includes(currentLevel) && !skippedLevels.includes(currentLevel)) {
    skippedLevels.push(currentLevel);
  }
  
  saveProgress();
  populateTowerMap();
  
  // Advance to next level automatically if not at lvl 100
  if (currentLevel < 100) {
    loadLevel(currentLevel + 1);
  } else {
    alert("You are at the summit (Level 100)!");
  }
}

function nextLevel() {
  document.getElementById('success-screen').classList.add('hidden');
  
  // Advance
  if (currentLevel < 100) {
    loadLevel(currentLevel + 1);
  } else {
    // Beat level 100! Congratulations overlay or message
    alert("Congratulations! You have conquered the 24 Tower and reached the Summit!");
    loadLevel(100);
  }
}

// Help overlay drawer
function setupSolverDrawer() {
  const solutionsBtn = document.getElementById('solutions-btn');
  const closeBtn = document.getElementById('close-drawer-btn');
  const overlay = document.getElementById('drawer-close-overlay');
  const drawer = document.getElementById('solutions-drawer');
  
  solutionsBtn.addEventListener('click', () => {
    sounds.click();
    
    const listContainer = document.getElementById('solutions-list');
    const countText = document.getElementById('solutions-count');
    
    listContainer.innerHTML = '';
    
    if (currentSolutions.length === 0) {
      countText.textContent = getDynamicStr('noSolutions');
    } else {
      countText.textContent = getDynamicStr('solutionsFound', { n: currentSolutions.length });
      
      currentSolutions.forEach(sol => {
        const item = document.createElement('div');
        item.className = 'sol-item';
        const displaySol = sol
          .replace(/\*/g, ' × ')
          .replace(/\//g, ' ÷ ');
        item.textContent = `${displaySol} = 24`;
        listContainer.appendChild(item);
      });
    }
    
    drawer.classList.remove('hidden');
  });
  
  const closeDrawer = () => {
    sounds.click();
    drawer.classList.add('hidden');
  };
  
  closeBtn.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
}

// Hint calculator
function setupHintButton() {
  const hintBtn = document.getElementById('hint-btn');
  
  hintBtn.addEventListener('click', () => {
    sounds.click();
    
    if (currentSolutions.length === 0) {
      alert(getDynamicStr('noSolutions'));
      return;
    }
    
    const targetFormula = currentSolutions[0];
    const innermostRegex = /\(([^()]+)\)/;
    const match = targetFormula.match(innermostRegex);
    
    let stepMsg = "";
    if (match) {
      stepMsg = match[1].replace(/\*/g, '×').replace(/\//g, '÷');
    } else {
      stepMsg = targetFormula.replace(/\*/g, '×').replace(/\//g, '÷');
    }
    
    const tracker = document.getElementById('formula-display');
    tracker.textContent = getDynamicStr('toastHint', { step: stepMsg });
    tracker.className = 'formula-hint-text';
  });
}

// Sidebar Drawer Control on Mobile
function setupMobileSidebar() {
  const toggleBtn = document.getElementById('toggle-map-btn');
  const sidebar = document.getElementById('tower-sidebar');
  
  // Create sidebar dark overlay
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);
  
  const toggleSidebar = () => {
    sounds.click();
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
  };
  
  toggleBtn.addEventListener('click', toggleSidebar);
  overlay.addEventListener('click', toggleSidebar);
}

// Initialize website
window.addEventListener('DOMContentLoaded', () => {
  // 1. Build levels dataset from solver combinations
  buildTowerDatabase();
  
  // 2. Load settings and player saves
  setupLanguage();
  setupSound();
  setupParticles();
  loadProgress();
  
  // 3. Bind interactions
  document.getElementById('undo-btn').addEventListener('click', undoAction);
  document.getElementById('reset-btn').addEventListener('click', resetAction);
  document.getElementById('skip-btn').addEventListener('click', skipLevel);
  document.getElementById('next-level-btn').addEventListener('click', nextLevel);
  
  // Operator triggers
  const opButtons = document.querySelectorAll('.op-btn');
  opButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      handleOperatorClick(btn.getAttribute('data-op'));
    });
  });
  
  // Keyboard triggers
  window.addEventListener('keydown', (e) => {
    if (e.key === '+') handleOperatorClick('+');
    else if (e.key === '-') handleOperatorClick('-');
    else if (e.key === '*' || e.key.toLowerCase() === 'x') handleOperatorClick('*');
    else if (e.key === '/') handleOperatorClick('/');
    else if (e.key === 'Escape') {
      const drawer = document.getElementById('solutions-drawer');
      if (!drawer.classList.contains('hidden')) {
        drawer.classList.add('hidden');
        sounds.click();
      }
    }
  });

  // 4. Setup sub-elements
  setupSolverDrawer();
  setupHintButton();
  setupMobileSidebar();
  
  // 5. Populate and center map
  populateTowerMap();
  loadLevel(currentLevel);
  centerActiveLevelInSidebar();
});
