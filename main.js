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
    if (isParty) {
        if(connection) connection.close();
        if(peer && !peer.destroyed) peer.destroy();
        peer = null; connection = null; isHost = false;
        clearTimeout(opponentFinishedTimer);
    }
    // Kompletter UI-Reset
    document.getElementById('createLobbySection').classList.add('hidden');
    document.getElementById('join-code-input').value = '';
    document.getElementById('host-status').textContent = 'Warte auf Mitspieler...';
    document.getElementById('client-status').textContent = '';
    document.getElementById('start-game-btn').disabled = true;
    document.getElementById('kick-player-btn').classList.add('hidden');
    document.getElementById('leave-lobby-btn').classList.add('hidden');
    document.getElementById('leave-lobby-btn').disabled = true;
    showScreen("mainMenu");
}

// ====== Party-Modus Logik (mit Server-Weckruf) ======
function showPartyMenu() { showScreen("partyLobby"); }

function generateShortCode() {
    return Math.random().toString(36).substring(2, 6).toUpperCase();
}

async function createPartyLobby() {
    if (peer) peer.destroy();
    isHost = true;
    const shortCode = generateShortCode();
    document.getElementById('lobby-code-display').textContent = shortCode;
    document.getElementById('createLobbySection').classList.remove('hidden');
    const hostStatus = document.getElementById('host-status');
    
    hostStatus.textContent = 'Verbinde mit Server...';
    try {
        await fetch(backendUrl); // Der "Ping" zum Aufwecken
    } catch (e) { /* Fehler hier ignorieren, Hauptsache Anfrage ist raus */ }
    
    hostStatus.textContent = 'Erstelle Lobby...';
    peer = new Peer();
    peer.on('open', async peerId => {
        try {
            const response = await fetch(`${backendUrl}/create-lobby`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lobbyCode: shortCode, peerId: peerId })
            });
            if (!response.ok) throw new Error("Server response not OK");
            hostStatus.textContent = 'Warte auf Mitspieler...';
        } catch (e) { hostStatus.textContent = "❌ Fehler bei Lobby-Erstellung. Server erreichbar?"; }
    });
    peer.on('connection', setupConnection);
    peer.on('error', (err) => {
        console.error("PeerJS Error:", err);
        hostStatus.textContent = `❌ Netzwerk-Fehler: ${err.type}`;
    });
}

async function joinPartyLobby() {
    if (peer) peer.destroy();
    isHost = false;
    const shortCode = document.getElementById('join-code-input').value.toUpperCase();
    const clientStatus = document.getElementById('client-status');
    if (shortCode.length !== 4) { clientStatus.textContent = "❌ Code muss 4 Zeichen lang sein!"; return; }

    clientStatus.textContent = "Wecke Server auf...";
    try {
        await fetch(backendUrl); // Der "Ping" zum Aufwecken
    } catch (e) { /* Fehler ignorieren */ }

    clientStatus.textContent = "Suche Lobby...";
    try {
        const res = await fetch(`${backendUrl}/join-lobby/${shortCode}`);
        if (!res.ok) { clientStatus.textContent = "❌ Lobby nicht gefunden."; return; }
        const data = await res.json();
        const hostPeerId = data.peerId;

        peer = new Peer();
        peer.on('open', () => { setupConnection(peer.connect(hostPeerId, { reliable: true })); });
        peer.on('error', (err) => {
            console.error("PeerJS Error:", err);
            clientStatus.textContent = `❌ Netzwerk-Fehler: ${err.type}`;
        });
    } catch(e) { clientStatus.textContent = "❌ Fehler beim Beitreten. Server erreichbar?"; }
}

function setupConnection(conn) {
    connection = conn;
    connection.on('open', () => {
        if (isHost) {
            document.getElementById('host-status').textContent = `✅ Spieler verbunden!`;
            document.getElementById('start-game-btn').disabled = false;
            document.getElementById('kick-player-btn').classList.remove('hidden');
        } else {
            document.getElementById('client-status').textContent = "✅ Verbunden! Warte auf Spielstart...";
            const leaveBtn = document.getElementById('leave-lobby-btn');
            leaveBtn.classList.remove('hidden');
            setTimeout(() => { leaveBtn.disabled = false; }, 5000);
        }
    });
    connection.on('data', handlePeerData);
    connection.on('close', () => {
        if (!partyState || !partyState.settings || partyState.round < partyState.settings.rounds) {
            alert("Verbindung zum Mitspieler verloren.");
            backToMenu(true);
        }
    });
}

function startPartyGame() {
    const rounds = parseInt(document.getElementById('round-select').value);
    const gameDomains = [...domains].sort(() => 0.5 - Math.random()).slice(0, rounds);
    const initialState = { type: 'start', domains: gameDomains, settings: { rounds: rounds } };
    connection.send(initialState);
    initializePartyGame(initialState);
}

function handlePeerData(data) {
    switch (data.type) {
        case 'start': initializePartyGame(data); break;
        case 'round_finished':
            partyState.opponentState = data.state;
            updatePartyScoreDisplay(true);
            if (partyState.myState.finished) {
                clearTimeout(opponentFinishedTimer);
                showRoundSummary();
            }
            break;
        case 'kicked': alert("Du wurdest aus der Lobby gekickt."); backToMenu(true); break;
        case 'left':
            alert("Dein Mitspieler hat die Lobby verlassen.");
            document.getElementById('host-status').textContent = 'Warte auf Mitspieler...';
            document.getElementById('start-game-btn').disabled = true;
            document.getElementById('kick-player-btn').classList.add('hidden');
            if(connection) connection.close();
            break;
    }
}

function copyLobbyCode() {
    const code = document.getElementById('lobby-code-display').textContent;
    if (code && code.includes('...')) return;
    navigator.clipboard.writeText(code).then(() => {
        document.getElementById('host-status').textContent = `Code "${code}" kopiert!`;
    });
}

function kickPlayer() { if(connection) { connection.send({ type: 'kicked' }); setTimeout(() => connection.close(), 500); } }
function leaveLobby() { if(connection) { connection.send({ type: 'left' }); setTimeout(() => backToMenu(true), 500); } }

// ====== Spielablauf & Runden-Logik (PARTY MODUS) ======
function initializePartyGame(initialState) {
    partyState = { myScore: 0, opponentScore: 0, round: 0, domains: initialState.domains, settings: initialState.settings };
    document.getElementById('player-stats').style.display = 'none';
    document.getElementById('party-score-display').style.display = 'block';
    document.getElementById('hint-btn').style.display = 'inline-block';
    showScreen('game');
    startNextRound();
}

function startNextRound() {
    if (partyState.round >= partyState.settings.rounds) {
        endGame(true);
        return;
    }
    partyState.myState = { finished: false, time: 0, points: 0, skipped: false };
    partyState.opponentState = { finished: false, time: 0, points: 0, skipped: false };
    updatePartyScoreDisplay(false);
    document.getElementById('round-info').textContent = `Runde ${partyState.round + 1}/${partyState.settings.rounds}`;
    document.getElementById('domain').textContent = partyState.domains[partyState.round].tld;
    document.getElementById('guess').value = '';
    document.getElementById('guess').disabled = false;
    document.getElementById('hint-btn').disabled = false;
    roundTimer = Date.now();
}

function onGuessOrSkip(isSkip = false) {
    if (partyState.myState.finished) return;
    clearTimeout(opponentFinishedTimer);
    const timeTaken = (Date.now() - roundTimer) / 1000;
    partyState.myState = { ...partyState.myState, time: timeTaken, finished: true, skipped: isSkip };
    let pointsObject = { base: 0, timeBonus: 0, total: 0 };
    const domainData = partyState.domains[partyState.round];
    const guess = document.getElementById("guess").value.trim().toLowerCase();
    if (!isSkip && domainData.answers.some(a => guess.includes(a))) {
        pointsObject.base = 250;
        const multiplier = Math.max(1, 2 - (timeTaken - 5) * 0.05);
        pointsObject.timeBonus = Math.round(pointsObject.base * (multiplier - 1));
        pointsObject.total = pointsObject.base + pointsObject.timeBonus;
    }
    partyState.myState.points = pointsObject.total;
    document.getElementById('guess').disabled = true;
    document.getElementById('hint-btn').disabled = true;
    connection.send({ type: 'round_finished', state: partyState.myState });
    if (partyState.opponentState.finished) {
        showRoundSummary();
    } else {
        document.getElementById('domain').textContent = 'Warte auf Gegner...';
        opponentFinishedTimer = setTimeout(showRoundSummary, 15000);
    }
}

function showRoundSummary() {
    clearTimeout(opponentFinishedTimer);
    let myFirstBonus = 0;
    let oppFirstBonus = 0;
    if (partyState.myState.finished && !partyState.myState.skipped && partyState.opponentState.finished && !partyState.opponentState.skipped) {
        if (partyState.myState.time < partyState.opponentState.time) {
            myFirstBonus = 50;
        } else if (partyState.opponentState.time < partyState.myState.time) {
            oppFirstBonus = 50;
        }
    }
    partyState.myScore += partyState.myState.points + myFirstBonus;
    partyState.opponentScore += partyState.opponentState.points + oppFirstBonus;
    const domainData = partyState.domains[partyState.round];
    document.getElementById('summary-correct-answer').textContent = `Lösung: ${domainData.tld.toUpperCase()} - ${domainData.answers[0]}`;
    document.getElementById('summary-points-info').innerHTML = `<p>Du: ${partyState.myState.points} (Basis) + ${myFirstBonus} (Bonus) = ${partyState.myState.points + myFirstBonus} Punkte</p><p>Gegner: ${partyState.opponentState.points} (Basis) + ${oppFirstBonus} (Bonus) = ${partyState.opponentState.points + oppFirstBonus} Punkte</p>`;
    showScreen('round-summary-overlay');
    updatePartyScoreDisplay(true);
    let countdown = 5;
    const timerEl = document.getElementById('summary-next-round-timer');
    const interval = setInterval(() => {
        timerEl.textContent = `Nächste Runde in ${countdown}...`;
        countdown--;
        if (countdown < 0) {
            clearInterval(interval);
            document.getElementById('round-summary-overlay').classList.add('hidden');
            partyState.round++;
            startNextRound();
        }
    }, 1000);
}

function updatePartyScoreDisplay(showScores) {
    if (showScores) {
        document.getElementById('party-score-display').textContent = `Du: ${partyState.myScore} | Gegner: ${partyState.opponentScore}`;
    } else {
        document.getElementById('party-score-display').textContent = 'Punkte am Ende der Runde';
    }
}

function flashPoints(text) {
    const container = document.getElementById('points-flash-container');
    const oldFlash = document.getElementById('points-flash');
    if(oldFlash) oldFlash.remove();
    const flash = document.createElement('div');
    flash.id = 'points-flash';
    flash.textContent = text;
    container.appendChild(flash);
    setTimeout(() => flash.remove(), 1500);
}

function getHint() {
    const currentDomain = connection ? partyState.domains[partyState.round] : gameState.current;
    if (!currentDomain || !currentDomain.hints || currentDomain.hints.length === 0) return;
    flashPoints(currentDomain.hints[0]);
    document.getElementById('hint-btn').disabled = true;
}

function skipDomain() {
    if (connection) { onGuessOrSkip(true); } 
    else { nextDomain(); }
}

// ====== Singleplayer & andere Modi ======
function startSingleplayer() {
    loadPlayerState();
    gameState = { round: 0, score: 0, xpThisRound: 0, domains: getDomainPool(10), current: {} };
    document.getElementById('player-stats').style.display = 'block';
    document.getElementById('party-score-display').style.display = 'none';
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
    if (gameState.round >= gameState.domains.length) {
        endGame(false); return;
    }
    gameState.current = gameState.domains[gameState.round];
    document.getElementById("domain").textContent = gameState.current.tld;
    document.getElementById("guess").value = "";
    document.getElementById("round-info").textContent = `Runde ${gameState.round + 1}/${gameState.domains.length}`;
    gameState.round++;
}

function endGame(isParty) {
    showScreen("gameOver");
    if(isParty) {
        document.getElementById('gameOverTitle').textContent = 'Party-Ergebnis';
        let resultText = `Dein Score: ${partyState.myScore}\nGegner-Score: ${partyState.opponentScore}`;
        if (partyState.myScore > partyState.opponentScore) resultText += "\n\n🎉 Du hast gewonnen! 🎉";
        else if (partyState.myScore < partyState.opponentScore) resultText += "\n\nDu hast verloren.";
        else resultText += "\n\nUnentschieden!";
        document.getElementById("finalScore").textContent = resultText;
        document.getElementById("xpGained").style.display = 'none';
        document.getElementById("leaderboard-submission").style.display = 'none';
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

function startEndlessMode() {
    gameState = { score: 0, correctCount: 0, recent: [], current: {} };
    showScreen("endlessGame");
    document.getElementById("endlessScore").textContent = "Score: 0";
    document.getElementById("endlessAnswerFlash").style.minHeight = '20px';
    document.getElementById("endlessAnswerFlash").textContent = '';
    nextEndlessDomain();
}

function nextEndlessDomain() {
    document.getElementById("endlessGuess").value = "";
    document.getElementById("endlessAnswerFlash").textContent = '';
    let pool = domains.filter(d => !gameState.recent.includes(d.tld));
    if (pool.length === 0) { gameState.recent = []; pool = domains; }
    const candidate = pool[Math.floor(Math.random() * pool.length)];
    gameState.current = candidate;
    gameState.recent.push(gameState.current.tld);
    if (gameState.recent.length > 50) gameState.recent.shift();
    document.getElementById("endlessDomain").textContent = gameState.current.tld;
}

function getXpForNextLevel(level) { return Math.floor(100 * Math.pow(1.15, level - 1)); }
function loadPlayerState() { const savedState = localStorage.getItem('domainGuessrPlayerState'); if (savedState) playerState = JSON.parse(savedState); updatePlayerUI(); }
function savePlayerState() { localStorage.setItem('domainGuessrPlayerState', JSON.stringify(playerState)); }
function addXp(amount) { playerState.xp += amount; const neededXp = getXpForNextLevel(playerState.level); if (playerState.xp >= neededXp) { playerState.level++; playerState.xp -= neededXp; } savePlayerState(); updatePlayerUI(); }
function updatePlayerUI() { 
    const xpForNext = getXpForNextLevel(playerState.level);
    const progress = Math.min(100, (playerState.xp / xpForNext) * 100);
    document.getElementById('level-text').textContent = `Level ${playerState.level}`;
    document.getElementById('xp-text').textContent = `${playerState.xp} / ${xpForNext} XP`;
    document.getElementById('xp-bar').style.width = `${progress}%`;
}

async function submitScore() { alert("Leaderboard wird in Phase 3 repariert."); }
async function showLeaderboard() { alert("Leaderboard wird in Phase 3 repariert."); }

// ====== Initialisierung & Event Listener ======
window.onload = () => {
    document.getElementById("guess").addEventListener("input", () => {
        const guess = document.getElementById("guess").value.trim().toLowerCase();
        if (connection) {
            if (partyState.domains[partyState.round].answers.some(a => guess.includes(a))) onGuessOrSkip(false);
        } else {
            if (!gameState.current || !gameState.current.answers) return;
            if (gameState.current.answers.some(a => guess.includes(a))) {
                const points = (gameState.current.difficulty || 1) * 100;
                gameState.score += points;
                const xpGained = (gameState.current.difficulty || 1) * 10;
                addXp(xpGained);
                gameState.xpThisRound += xpGained;
                flashPoints(`+${points}`);
                nextDomain();
            }
        }
    });

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

    window.game = {
        startSingleplayer, startEndlessMode, showPartyMenu, showLeaderboard, backToMenu,
        createPartyLobby, joinPartyLobby, copyLobbyCode, kickPlayer, leaveLobby, startPartyGame,
        getHint, skipDomain, submitScore
    };
    
    loadPlayerState();
    showScreen('mainMenu');
};
