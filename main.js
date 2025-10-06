// Wir holen uns die Domain-Liste aus der anderen Datei
import { domains } from './domains.js';

let currentDomain = null;
let usedDomains = [];
let score = 0;

const tldDisplay = document.getElementById("tld");
const hintDisplay = document.getElementById("hint");
const input = document.getElementById("answerInput");
const submitBtn = document.getElementById("submitBtn");
const nextBtn = document.getElementById("nextBtn");
const scoreDisplay = document.getElementById("score");

function getRandomDomain() {
  const remaining = domains.filter(d => !usedDomains.includes(d.tld));
  if (remaining.length === 0) {
    alert("Alle Domains geraten! 🎉");
    return null;
  }
  const domain = remaining[Math.floor(Math.random() * remaining.length)];
  usedDomains.push(domain.tld);
  return domain;
}

function showNewDomain() {
  currentDomain = getRandomDomain();
  if (!currentDomain) return;
  tldDisplay.textContent = currentDomain.tld;
  hintDisplay.textContent = "💡 Tipp 1: " + currentDomain.hints[0];
  input.value = "";
  nextBtn.style.display = "none";
  submitBtn.style.display = "inline-block";
}

submitBtn.addEventListener("click", () => {
  if (!currentDomain) return;
  const answer = input.value.trim().toLowerCase();
  if (currentDomain.answers.includes(answer)) {
    score += Math.max(10 - currentDomain.difficulty * 2, 1);
    scoreDisplay.textContent = "Punkte: " + score;
    hintDisplay.textContent = "✅ Richtig! " + currentDomain.tld + " = " + currentDomain.answers[0].toUpperCase();
    submitBtn.style.display = "none";
    nextBtn.style.display = "inline-block";
  } else {
    const hintIndex = currentDomain.hints.findIndex(h => hintDisplay.textContent.includes(h));
    if (hintIndex < currentDomain.hints.length - 1) {
      hintDisplay.textContent = "💡 Tipp " + (hintIndex + 2) + ": " + currentDomain.hints[hintIndex + 1];
    } else {
      hintDisplay.textContent = "❌ Falsch! Richtige Antwort: " + currentDomain.answers[0];
      submitBtn.style.display = "none";
      nextBtn.style.display = "inline-block";
    }
  }
});

nextBtn.addEventListener("click", showNewDomain);
window.onload = showNewDomain;
