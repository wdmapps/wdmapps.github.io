import {
  ALL_OPERATIONS,
  addRankingEntry,
  answerFor,
  generateEquation,
  generateOptions,
  levelFor,
  normalizeRanking,
  pointsForCorrect,
} from "./contash-core.mjs";

const RANKING_KEY = "contash_ranking_v1";
const PLAYER_KEY = "contash_player_v1";
const MODE_KEY = "contash_mode_v1";
const FRUITS = ["🍎", "🍊", "🍋", "🍉", "🍇", "🍓", "🍑", "🍌", "🍒"];

const screens = new Map(
  [...document.querySelectorAll(".screen")].map((screen) => [screen.id.replace("-screen", ""), screen]),
);

const elements = {
  playerName: document.querySelector("#player-name"),
  startButton: document.querySelector("#start-button"),
  modeButtons: [...document.querySelectorAll(".mode-button")],
  gameGreeting: document.querySelector("#game-greeting"),
  scoreChip: document.querySelector("#score-chip"),
  livesChip: document.querySelector("#lives-chip"),
  levelChip: document.querySelector("#level-chip"),
  streakLabel: document.querySelector("#streak-label"),
  questionCard: document.querySelector("#question-card"),
  questionVisual: document.querySelector("#question-visual"),
  answerGrid: document.querySelector("#answer-grid"),
  feedback: document.querySelector("#feedback"),
  rankingList: document.querySelector("#ranking-list"),
  rankingEmpty: document.querySelector("#ranking-empty"),
  finalPlayer: document.querySelector("#final-player"),
  finalScore: document.querySelector("#final-score"),
  finalMedal: document.querySelector("#final-medal"),
  rankingPosition: document.querySelector("#ranking-position"),
  newRecord: document.querySelector("#new-record"),
  backgroundMusic: document.querySelector("#background-music"),
  correctSound: document.querySelector("#correct-sound"),
  wrongSound: document.querySelector("#wrong-sound"),
};

const state = {
  currentScreen: "splash",
  returnScreen: "home",
  name: loadText(PLAYER_KEY),
  operations: loadOperations(),
  points: 0,
  lives: 3,
  streak: 0,
  highScore: 0,
  newRecord: false,
  rankingPosition: -1,
  questionId: 0,
  equation: null,
  fruit: FRUITS[0],
  options: [],
  triedOptions: new Set(),
  started: false,
  finished: false,
};

elements.backgroundMusic.volume = 0.4;
elements.correctSound.volume = 0.8;
elements.wrongSound.volume = 0.8;
elements.playerName.value = state.name;
syncModeButtons();
updateStartButton();

elements.playerName.addEventListener("input", () => {
  const cleanName = elements.playerName.value.replace(/[\r\n]/g, "").slice(0, 20);
  if (elements.playerName.value !== cleanName) elements.playerName.value = cleanName;
  state.name = cleanName;
  updateStartButton();
});

elements.playerName.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !elements.startButton.disabled) startGame();
});

elements.modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.operations = button.dataset.operations.split(",");
    syncModeButtons();
    updateStartButton();
  });
});

elements.startButton.addEventListener("click", startGame);
document.querySelector("#home-ranking-button").addEventListener("click", () => showRanking("home"));
document.querySelector("#about-button").addEventListener("click", () => showScreen("about"));
document.querySelector("#restart-button").addEventListener("click", goHome);
document.querySelector("#ranking-back-button").addEventListener("click", () => showScreen(state.returnScreen));
document.querySelector("#about-back-button").addEventListener("click", () => showScreen("home"));
document.querySelector("#play-again-button").addEventListener("click", startGame);
document.querySelector("#game-over-ranking-button").addEventListener("click", () => showRanking("game-over"));
document.querySelector("#go-home-button").addEventListener("click", goHome);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    elements.backgroundMusic.pause();
  } else if (state.started && !state.finished && state.currentScreen === "game") {
    playAudio(elements.backgroundMusic, false);
  }
});

window.setTimeout(() => showScreen("home"), 2200);

function showScreen(name) {
  screens.forEach((screen, screenName) => {
    const active = screenName === name;
    screen.hidden = !active;
    screen.classList.toggle("is-active", active);
  });
  state.currentScreen = name;
  window.scrollTo({ top: 0, behavior: "instant" });

  const heading = screens.get(name)?.querySelector("h1");
  if (name !== "home" && heading) heading.focus?.({ preventScroll: true });
}

function syncModeButtons() {
  const selected = state.operations.join(",");
  elements.modeButtons.forEach((button) => {
    const isSelected = button.dataset.operations === selected;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-checked", String(isSelected));
    const baseLabel = button.textContent.replace(/^✓\s/, "");
    button.textContent = isSelected ? `✓ ${baseLabel}` : baseLabel;
  });
}

function updateStartButton() {
  elements.startButton.disabled = !state.name.trim() || state.operations.length === 0;
}

function startGame() {
  const validName = state.name.trim();
  if (!validName || !state.operations.length) return;

  state.name = validName;
  state.points = 0;
  state.lives = 3;
  state.streak = 0;
  state.highScore = highestScore();
  state.newRecord = false;
  state.rankingPosition = -1;
  state.started = true;
  state.finished = false;
  elements.playerName.value = validName;
  saveText(PLAYER_KEY, validName);
  saveText(MODE_KEY, state.operations.join(","));
  clearFeedback();
  generateQuestion();
  updateStatus();
  showScreen("game");
  playAudio(elements.backgroundMusic, false);
}

function generateQuestion() {
  const level = levelFor(state.points);
  state.equation = generateEquation(state.operations, level);
  state.fruit = FRUITS[Math.floor(Math.random() * FRUITS.length)];
  state.questionId += 1;
  state.triedOptions = new Set();
  const answer = answerFor(
    state.equation.number1,
    state.equation.number2,
    state.equation.operation,
  );
  state.options = generateOptions(answer, level);
  renderQuestion();
  renderAnswers();
}

function renderQuestion() {
  const { number1, number2, operation } = state.equation;
  const spokenOperation = { "+": "mais", "-": "menos", "×": "vezes", "÷": "dividido por" }[operation];
  elements.questionVisual.setAttribute(
    "aria-label",
    `Quanto é ${number1} ${spokenOperation} ${number2}?`,
  );
  elements.questionVisual.replaceChildren();

  if (operation === "+" || operation === "-") {
    elements.questionVisual.append(
      textElement("div", state.fruit.repeat(number1), "emoji-line"),
      textElement("div", operation, "operator"),
      textElement("div", state.fruit.repeat(number2), "emoji-line"),
    );
    return;
  }

  elements.questionVisual.append(
    textElement("div", operation, "operator"),
    textElement("div", operation === "×" ? "Grupos iguais" : "Divida igualmente", "group-caption"),
  );

  const groups = document.createElement("div");
  groups.className = "emoji-groups";
  const groupCount = operation === "×" ? number1 : number2;
  const itemsPerGroup = operation === "×" ? number2 : number1 / number2;
  for (let index = 0; index < groupCount; index += 1) {
    groups.append(textElement("span", state.fruit.repeat(itemsPerGroup), "emoji-group"));
  }
  elements.questionVisual.append(groups);
}

function renderAnswers() {
  const questionId = state.questionId;
  elements.answerGrid.replaceChildren();
  state.options.forEach((option) => {
    const button = textElement("button", String(option), "answer-button");
    button.type = "button";
    button.disabled = state.triedOptions.has(option) || state.finished;
    button.addEventListener("click", () => checkAnswer(option, questionId));
    elements.answerGrid.append(button);
  });
}

function checkAnswer(option, questionId) {
  if (!state.started || state.finished || state.lives <= 0
    || questionId !== state.questionId || state.triedOptions.has(option)) return;

  state.triedOptions.add(option);
  renderAnswers();
  const correctAnswer = answerFor(
    state.equation.number1,
    state.equation.number2,
    state.equation.operation,
  );

  if (option === correctAnswer) {
    const previousStreak = state.streak;
    const earnedPoints = pointsForCorrect(previousStreak);
    state.points += earnedPoints;
    state.streak += 1;
    setFeedback(previousStreak >= 2
      ? `🎉 Correto! (+${earnedPoints} pts, 🔥${state.streak})`
      : "🎉 Correto! +10 pts");
    playAudio(elements.correctSound);
    animate(elements.questionCard, "correct");
    animate(elements.scoreChip, "pop");
    generateQuestion();
    updateStatus();
    return;
  }

  state.lives -= 1;
  state.streak = 0;
  playAudio(elements.wrongSound);
  animate(elements.livesChip, "pop");

  if (state.lives <= 0) {
    finishGame(correctAnswer);
  } else {
    setFeedback("😅 Tente novamente!");
    updateStatus();
  }
}

function finishGame(correctAnswer) {
  state.finished = true;
  state.newRecord = state.points > state.highScore;
  stopMusic();
  setFeedback(`💔 A resposta era ${correctAnswer}`);
  updateStatus();
  renderAnswers();

  const result = addRankingEntry(loadRanking(), state.name, state.points, today());
  state.rankingPosition = result.position;
  saveRanking(result.entries);
  window.setTimeout(showGameOver, 500);
}

function updateStatus() {
  elements.gameGreeting.textContent = `Olá, ${state.name}! 👋`;
  elements.scoreChip.textContent = `⭐ ${state.points}`;
  elements.livesChip.textContent = "❤️".repeat(state.lives);
  elements.livesChip.setAttribute("aria-label", `${state.lives} ${state.lives === 1 ? "vida" : "vidas"}`);
  elements.levelChip.textContent = `🎯 Nv ${levelFor(state.points)}`;
  elements.streakLabel.textContent = `🔥 Streak: ${state.streak}`;
  elements.streakLabel.hidden = state.streak < 2;
}

function setFeedback(message) {
  elements.feedback.textContent = message;
  elements.feedback.hidden = false;
}

function clearFeedback() {
  elements.feedback.textContent = "";
  elements.feedback.hidden = true;
}

function showGameOver() {
  elements.finalPlayer.textContent = `${state.name}, sua pontuação:`;
  elements.finalScore.textContent = `${state.points} pontos`;

  const medal = state.points >= 200
    ? "🥇 Medalha de Ouro!"
    : state.points >= 100
      ? "🥈 Medalha de Prata!"
      : state.points >= 50
        ? "🥉 Medalha de Bronze!"
        : "";
  elements.finalMedal.textContent = medal;
  elements.finalMedal.hidden = !medal;

  elements.rankingPosition.textContent = `📊 ${state.rankingPosition}° lugar no ranking!`;
  elements.rankingPosition.hidden = state.rankingPosition <= 0;
  elements.newRecord.hidden = !state.newRecord;
  showScreen("game-over");
}

function showRanking(returnScreen) {
  state.returnScreen = returnScreen;
  const ranking = loadRanking();
  elements.rankingList.replaceChildren();
  elements.rankingEmpty.hidden = ranking.length > 0;

  ranking.forEach((entry, index) => {
    const row = document.createElement("article");
    row.className = "ranking-entry";
    row.style.animationDelay = `${index * 60}ms`;

    const position = textElement("span", `${index + 1}.`, "ranking-number");
    const player = document.createElement("div");
    player.className = "ranking-player";
    player.append(textElement("strong", entry.nome), textElement("span", entry.medalha));

    const score = document.createElement("div");
    score.className = "ranking-points";
    score.append(textElement("strong", String(entry.pontos)), textElement("span", entry.data));
    row.append(position, player, score);
    elements.rankingList.append(row);
  });
  showScreen("ranking");
}

function goHome() {
  stopMusic();
  state.started = false;
  state.finished = false;
  state.points = 0;
  state.lives = 3;
  state.streak = 0;
  state.triedOptions = new Set();
  clearFeedback();
  showScreen("home");
}

function playAudio(audio, restart = true) {
  if (restart) audio.currentTime = 0;
  const promise = audio.play();
  if (promise) promise.catch(() => {});
}

function stopMusic() {
  elements.backgroundMusic.pause();
  elements.backgroundMusic.currentTime = 0;
}

function animate(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  window.setTimeout(() => element.classList.remove(className), 320);
}

function textElement(tag, text, className = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function loadRanking() {
  try {
    const raw = localStorage.getItem(RANKING_KEY);
    return raw ? normalizeRanking(JSON.parse(raw)) : [];
  } catch {
    localStorage.removeItem(RANKING_KEY);
    return [];
  }
}

function saveRanking(ranking) {
  try {
    localStorage.setItem(RANKING_KEY, JSON.stringify(ranking));
  } catch {
    // The game remains playable when storage is blocked.
  }
}

function highestScore() {
  return loadRanking().reduce((highest, entry) => Math.max(highest, entry.pontos), 0);
}

function today() {
  const date = new Date();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function loadText(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function saveText(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Local persistence is optional.
  }
}

function loadOperations() {
  const stored = loadText(MODE_KEY).split(",").filter((item) => ALL_OPERATIONS.includes(item));
  if (stored.length === 4 || stored.length === 1) return stored;
  return ["+"];
}
