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
    // Kompletter UI-Reset für die Party-Lobby
    document.getElementById('createLobbySection').classList.add('hidden');
    document.getElementById('join-code-input').value = '';
    document.getElementById('host-status').textContent = 'Warte auf Mitspieler...';
    document.getElementById('client-status').textContent = '';
    document.getElementById('start-game-btn').disabled = true;
    document.getElementById('kick-player-btn').classList.add('hidden');
    document.getElementById('leave-lobby-btn').classList.add('hidden');
    document.getElementById('leave-lobby-btn').disabled = true; // Cooldown Reset
    showScreen("mainMenu");
}

// ====== Party-Modus Logik ======
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
    document.getElementById('host-status').textContent = 'Erstelle Lobby...';

    peer = new Peer();
    peer.on('open', async peerId => {
        try {
            await fetch(`${backendUrl}/create-lobby`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lobbyCode: shortCode, peerId: peerId })
            });
            document.getElementById('host-status').textContent = 'Warte auf Mitspieler...';
        } catch (e) { document.getElementById('host-status').textContent = "❌ Fehler bei Lobby-Erstellung."; }
    });
    peer.on('connection', setupConnection);
    peer.on('error', (err) => {
        console.error("PeerJS Error:", err);
        document.getElementById('host-status').textContent = `❌ Netzwerk-Fehler: ${err.type}`;
    });
}

async function joinPartyLobby() {
    if (peer) peer.destroy();
    isHost = false;
    const shortCode = document.getElementById('join-code-input').value.toUpperCase();
    if (shortCode.length !== 4) { document.getElementById('client-status').textContent = "❌ Code muss 4 Zeichen lang sein!"; return; }

    document.getElementById('client-status').textContent = "Suche Lobby...";
    try {
        const res = await fetch(`${backendUrl}/join-lobby/${shortCode}`);
        if (!res.ok) { document.getElementById('client-status').textContent = "❌ Lobby nicht gefunden."; return; }
        const data = await res.json();
        const hostPeerId = data.peerId;

        peer = new Peer();
        peer.on('open', () => {
            setupConnection(peer.connect(hostPeerId, { reliable: true }));
        });
        peer.on('error', (err) => {
            console.error("PeerJS Error:", err);
            document.getElementById('client-status').textContent = `❌ Netzwerk-Fehler: ${err.type}`;
        });
    } catch(e) { document.getElementById('client-status').textContent = "❌ Fehler beim Beitreten."; }
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
            setTimeout(() => { leaveBtn.disabled = false; }, 5000); // 5s Cooldown
        }
    });

    connection.on('data', handlePeerData);
    connection.on('close', () => {
        if (!partyState || partyState.round < partyState.settings.rounds) {
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
    if (code && code !== 'Verbinde...') {
        navigator.clipboard.writeText(code).then(() => {
            document.getElementById('host-status').textContent = `Code "${code}" kopiert!`;
        });
    }
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

    let pointsObject = { base: 0, timeBonus: 0, firstBonus: 0, total: 0 };
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
    
    if (partyState.myState.finished && !partyState.myState.skipped && partyState.opponentState.finished && !partyState.opponentState.skipped) {
        if (partyState.myState.time < partyState.opponentState.time) {
            partyState.myState.points += 50;
        } else if (partyState.opponentState.time < partyState.myState.time) {
            partyState.opponentState.points += 50;
        }
    }
    partyState.myScore += partyState.myState.points;
    partyState.opponentScore += partyState.opponentState.points;
    
    const domainData = partyState.domains[partyState.round];
    document.getElementById('summary-correct-answer').textContent = `Lösung: ${domainData.tld.toUpperCase()} - ${domainData.answers[0]}`;
    
    document.getElementById('summary-points-info').innerHTML = `
        <p>Du: ${partyState.myState.points} Punkte</p>
        <p>Gegner: ${partyState.opponentState.points} Punkte</p>
    `;

    showScreen('round-summary-overlay');
    updatePartyScoreDisplay(true);

    let countdown = 5;
    const timerEl = document.getElementById('summary-next-round-timer');
    const interval = setInterval(() => {
        timerEl.textContent = `Nächste Runde in ${countdown}...`;
        countdown--;
        if (countdown < 0) {
            clearInterval(interval);
            showScreen('game');
            partyState.round++;
            startNextRound();
        }
    }, 1000);
}

function updatePartyScoreDisplay(showScores) {
    const myName = isHost ? "Host" : "Gast";
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
    if (connection) {
        onGuessOrSkip(true);
    } else {
        nextDomain();
    }
}


// ====== Singleplayer Logik ======
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
        endGame(false);
        return;
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


// ====== Endlos-Modus ======
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


// ====== XP & Level System ======
function getXpForNextLevel(level) { return Math.floor(100 * Math.pow(1.15, level - 1)); }
function loadPlayerState() { const savedState = localStorage.getItem('domainGuessrPlayerState'); if (savedState) playerState = JSON.parse(savedState); updatePlayerUI(); }
function savePlayerState() { localStorage.setItem('domainGuessrPlayerState', JSON.stringify(playerState)); }

function updatePlayerUI() {
    const xpForNext = getXpForNextLevel(playerState.level);
    document.getElementById('playerLevel').textContent = `Level ${playerState.level}`;
    document.getElementById('playerXp').textContent = `XP: ${playerState.xp}/${xpForNext}`;
    const progress = Math.min(100, (playerState.xp / xpForNext) * 100);
    document.getElementById('xpProgressBar').style.width = `${progress}%`;
}

function addXp(amount) {
    playerState.xp += amount;
    const xpForNext = getXpForNextLevel(playerState.level);
    if (playerState.xp >= xpForNext) {
        playerState.level++;
        playerState.xp -= xpForNext;
        flashPoints(`🎉 Level Up! Du bist jetzt Level ${playerState.level}`);
    }
    savePlayerState();
    updatePlayerUI();
}


// ====== Leaderboard-System ======
async function submitScore() {
    const nameInput = document.getElementById("playerName");
    const playerName = nameInput.value.trim();
    if (!playerName) { alert("Bitte gib einen Namen ein!"); return; }
    document.getElementById("submitScoreBtn").disabled = true;
    document.getElementById("submitScoreBtn").textContent = "Sende...";

    try {
        const response = await fetch(`${backendUrl}/leaderboard`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: playerName, score: gameState.score })
        });
        if (response.ok) {
            alert("Score erfolgreich hochgeladen!");
            showLeaderboard();
        } else { alert("Fehler beim Hochladen des Scores."); }
    } catch(e) { alert("Netzwerkfehler."); }
}

async function showLeaderboard() {
    showScreen("leaderboard");
    const table = document.getElementById("leaderboardTable");
    table.innerHTML = "<tr><th>Platz</th><th>Name</th><th>Score</th></tr>";

    try {
        const res = await fetch(`${backendUrl}/leaderboard`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        data.slice(0, 50).forEach((entry, i) => {
            const row = document.createElement("tr");
            row.innerHTML = `<td>${i + 1}</td><td>${entry.name}</td><td>${entry.score}</td>`;
            table.appendChild(row);
        });
    } catch(e) {
        table.innerHTML += "<tr><td colspan='3'>Fehler beim Laden.</td></tr>";
    }
}
