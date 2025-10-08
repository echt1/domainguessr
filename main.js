// Wir holen uns die Domain-Liste aus der 'domains.js' Datei
import { domains } from './domains.js';

// ====== Globale Variablen & Konfiguration ======
const backendUrl = "https://domainguessr-backend.onrender.com";
const allScreens = ["mainMenu", "partyLobby", "game", "gameOver", "leaderboard", "endlessGame", "round-summary-overlay"];
let gameState = {};
let playerState = { level: 1, xp: 0 };
let peer, connection, isHost, partyState, roundTimer, opponentFinishedTimer;

// ====== UI-Management ======
function showScreen(screenId) {
    allScreens.forEach(id => document.getElementById(id)?.classList.add("hidden"));
    document.getElementById(screenId)?.classList.remove("hidden");
}

function backToMenu(isParty = false) {
    if (isParty && peer) {
        if(connection) connection.close();
        if(peer && !peer.destroyed) peer.destroy();
        peer = null; connection = null; isHost = false;
    }
    // Kompletter UI-Reset
    document.getElementById('createLobbySection').classList.add('hidden');
    document.getElementById('join-code-input').value = '';
    document.getElementById('host-status').textContent = 'Warte auf Mitspieler...';
    document.getElementById('client-status').textContent = '';
    document.getElementById('start-game-btn').disabled = true;
    document.getElementById('kick-player-btn').classList.add('hidden');
    document.getElementById('leave-lobby-btn').classList.add('hidden');
    showScreen("mainMenu");
}

// ====== Party-Modus Logik ======
function showPartyMenu() { showScreen("partyLobby"); }

function generateShortCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

async function createPartyLobby() {
    // ... (Diese Funktion und die folgenden sind Platzhalter und werden in Phase 2 gefüllt)
    // Die Logik hier wird bewusst einfach gehalten, bis die Singleplayer-Basis steht.
}
async function joinPartyLobby() {}
function setupConnection(conn) {}
function startPartyGame() {}
function handlePeerData(data) {}
function copyLobbyCode() {}
function kickPlayer() {}
function leaveLobby() {}


// ====== Spielablauf & Runden-Logik (Fokus auf Singleplayer für Phase 1) ======
function startSingleplayer() {
    loadPlayerState();
    // Wir nehmen 10 zufällige Domains aus dem Pool für die Runde
    gameState = {
        round: 0,
        score: 0,
        xpThisRound: 0,
        domains: getDomainPool(10), // Feste Liste für die Runde
        current: {}
    };
    
    document.getElementById('player-stats').style.display = 'block';
    document.getElementById('party-score-display').style.display = 'none';
    // Tipps im Singleplayer ausblenden, wie gewünscht
    document.getElementById('hint-btn').style.display = 'none';
    showScreen("game");
    nextDomain();
}

function getDomainPool(count) {
    const level = playerState.level;
    let pool;
    if (level <= 5) pool = domains.filter(d => d.difficulty === 1);
    else if (level <= 10) pool = domains.filter(d => d.difficulty <= 2);
    else if (level <= 15) pool = domains.filter(d => d.difficulty >= 2 && d.difficulty <= 3);
    else if (level <= 20) pool = domains.filter(d => d.difficulty >= 3 && d.difficulty <= 4);
    else pool = domains.filter(d => d.difficulty >= 4);

    const shuffled = [...pool].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

function nextDomain() {
    // BUGFIX: Prüfe gegen die Länge der Runden-Liste, nicht hartcodiert auf 10
    if (gameState.round >= gameState.domains.length) {
        endGame(false); // isParty = false
        return;
    }
    
    gameState.current = gameState.domains[gameState.round];
    
    document.getElementById("domain").textContent = gameState.current.tld;
    document.getElementById("guess").value = "";
    document.getElementById("round-info").textContent = `Runde ${gameState.round + 1}/${gameState.domains.length}`;
    gameState.round++;
}

// Event Listener für die Eingabe. Nur einmal am Anfang definieren.
document.getElementById("guess").addEventListener("input", () => {
    // Party-Modus-Logik ist hier noch nicht drin, kommt in Phase 2
    if (connection) return;

    // Singleplayer-Logik
    const guess = document.getElementById("guess").value.trim().toLowerCase();
    if (!gameState.current || !gameState.current.answers) return;
    if (gameState.current.answers.some(a => guess.includes(a))) {
        onCorrectGuess(false); // isParty = false
    }
});

function onCorrectGuess(isParty) {
    // Diese Funktion wird später für beide Modi genutzt
    if (isParty) {
        // Logik für Party-Modus kommt in Phase 2
    } else { // Singleplayer
        const points = (gameState.current.difficulty || 1) * 100;
        gameState.score += points;
        const xpGained = (gameState.current.difficulty || 1) * 10;
        addXp(xpGained);
        gameState.xpThisRound += xpGained;
        flashPoints(`+${points}`);
        nextDomain();
    }
}

function flashPoints(text) {
    const container = document.getElementById('points-flash-container');
    // Entferne alten Flash, falls vorhanden
    const oldFlash = document.getElementById('points-flash');
    if(oldFlash) oldFlash.remove();

    const flash = document.createElement('div');
    flash.id = 'points-flash';
    flash.textContent = text;
    container.appendChild(flash);
    setTimeout(() => flash.remove(), 1500);
}


function skipDomain() {
    // Party-Modus-Logik kommt in Phase 2
    if (connection) return;

    // Singleplayer
    nextDomain();
}

function getHint() {
    // Party-Modus-Logik kommt in Phase 2
    if (connection) return;
    
    // Im Singleplayer passiert nichts, da der Button versteckt ist
}

function endGame(isParty) {
    showScreen("gameOver");
    if(isParty) {
        // Logik für Party-Modus kommt in Phase 2
    } else {
        document.getElementById('gameOverTitle').textContent = 'Runde beendet!';
        document.getElementById("finalScore").textContent = `Dein Score: ${gameState.score}`;
        document.getElementById("xpGained").textContent = `Du hast ${gameState.xpThisRound} XP verdient!`;
        document.getElementById("xpGained").style.display = 'block';
        document.getElementById("leaderboard-submission").style.display = 'block';
        document.getElementById("submitScoreBtn").disabled = false;
        document.getElementById("submitScoreBtn").textContent = "Score hochladen";
    }
}

// ====== Endlos-Modus ======
function startEndlessMode() {
    gameState = { score: 0, correctCount: 0, recent: [], current: {} };
    showScreen("endlessGame");
    document.getElementById("endlessScore").textContent = "Score: 0";
    document.getElementById("endlessAnswerFlash").style.minHeight = '20px'; // Stellt sicher, dass das Layout nicht springt
    document.getElementById("endlessAnswerFlash").textContent = '';

    nextEndlessDomain();
}
function nextEndlessDomain() {
    document.getElementById("endlessGuess").value = "";
    document.getElementById("endlessAnswerFlash").textContent = '';
    
    let pool = domains.filter(d => !gameState.recent.includes(d.tld));
    if (pool.length === 0) { // Wenn alle Domains durch sind, fange von vorne an
        gameState.recent = [];
        pool = domains;
    }

    const candidate = pool[Math.floor(Math.random() * pool.length)];
    gameState.current = candidate;
    gameState.recent.push(gameState.current.tld);
    if (gameState.recent.length > 50) gameState.recent.shift();
    document.getElementById("endlessDomain").textContent = gameState.current.tld;
}

document.getElementById("endlessGuess").addEventListener("input", () => {
    const guess = document.getElementById("endlessGuess").value.trim().toLowerCase();
    if (gameState.current.answers.some(a => guess.includes(a))) {
        gameState.correctCount++;
        const streakBonus = Math.floor(gameState.correctCount / 10);
        gameState.score += 10 + streakBonus;
        document.getElementById("endlessScore").textContent = "Score: " + gameState.score;
        nextEndlessDomain();
    }
});
document.getElementById("endlessSkipBtn").addEventListener("click", () => {
    const flash = document.getElementById("endlessAnswerFlash");
    flash.textContent = "Antwort: " + gameState.current.answers[0];
    setTimeout(() => nextEndlessDomain(), 1200);
});

// ====== XP & Level System ======
function getXpForNextLevel(level) { return Math.floor(100 * Math.pow(1.15, level - 1)); }
function loadPlayerState() { const savedState = localStorage.getItem('domainGuessrPlayerState'); if (savedState) playerState = JSON.parse(savedState); updatePlayerUI(); }
function savePlayerState() { localStorage.setItem('domainGuessrPlayerState', JSON.stringify(playerState)); }
function addXp(amount) { playerState.xp += amount; const neededXp = getXpForNextLevel(playerState.level); if (playerState.xp >= neededXp) { playerState.level++; playerState.xp -= neededXp; } savePlayerState(); updatePlayerUI(); }
function updatePlayerUI() { const neededXp = getXpForNextLevel(playerState.level); const xpPercentage = Math.min((playerState.xp / neededXp) * 100, 100); document.getElementById('level-text').textContent = `Level ${playerState.level}`; document.getElementById('xp-text').textContent = `${playerState.xp} / ${neededXp} XP`; document.getElementById('xp-bar').style.width = `${xpPercentage}%`; }

// ====== Leaderboard ======
async function submitScore() { /* ... Dein Leaderboard-Code ... */ }
async function showLeaderboard() { /* ... Dein Leaderboard-Code ... */ }

// ====== Initialisierung & Zuweisung an das window-Objekt ======
// Macht die Funktionen für die HTML onclick="" Attribute verfügbar
window.game = {
    startSingleplayer,
    startEndlessMode,
    showPartyMenu,
    showLeaderboard,
    backToMenu,
    createPartyLobby,
    joinPartyLobby,
    copyLobbyCode,
    kickPlayer,
    leaveLobby,
    startPartyGame,
    getHint,
    skipDomain,
    submitScore
};

// Startet das Spiel, wenn die Seite geladen ist
window.onload = () => {
    loadPlayerState();
    showScreen('mainMenu');
};
