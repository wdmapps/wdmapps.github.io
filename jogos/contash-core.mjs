export const ALL_OPERATIONS = ["+", "-", "×", "÷"];

export function levelFor(points) {
  if (points >= 200) return 3;
  if (points >= 100) return 2;
  return 1;
}

export function medalFor(points) {
  if (points >= 200) return "🥇 Ouro";
  if (points >= 100) return "🥈 Prata";
  if (points >= 50) return "🥉 Bronze";
  return "🌟 Iniciante";
}

export function answerFor(number1, number2, operation) {
  switch (operation) {
    case "+": return number1 + number2;
    case "-": return number1 - number2;
    case "×": return number1 * number2;
    case "÷": return Math.trunc(number1 / number2);
    default: throw new Error(`Operação desconhecida: ${operation}`);
  }
}

function randomInt(min, maxExclusive, random) {
  return min + Math.floor(random() * (maxExclusive - min));
}

function shuffle(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function generateEquation(operations, level, random = Math.random) {
  if (!operations.length) return null;

  const operation = operations[Math.floor(random() * operations.length)];
  const limit = ["+", "-"].includes(operation)
    ? (level === 1 ? 6 : level === 2 ? 9 : 11)
    : (level === 1 ? 4 : level === 2 ? 6 : 8);

  switch (operation) {
    case "+":
    case "×":
      return {
        number1: randomInt(1, limit, random),
        number2: randomInt(1, limit, random),
        operation,
      };
    case "-": {
      const number1 = randomInt(2, limit, random);
      return { number1, number2: randomInt(1, number1, random), operation };
    }
    case "÷": {
      const divisor = randomInt(1, limit, random);
      const result = randomInt(1, limit, random);
      return { number1: divisor * result, number2: divisor, operation };
    }
    default:
      throw new Error(`Operação desconhecida: ${operation}`);
  }
}

export function generateOptions(correctAnswer, level, random = Math.random) {
  const variation = level === 1 ? 2 : level === 2 ? 4 : 6;
  const alternatives = new Set();

  for (let value = Math.max(0, correctAnswer - variation); value <= correctAnswer + variation; value += 1) {
    if (value !== correctAnswer) alternatives.add(value);
  }

  let nextAlternative = correctAnswer + variation + 1;
  while (alternatives.size < 3) {
    alternatives.add(nextAlternative);
    nextAlternative += 1;
  }

  return shuffle([...shuffle([...alternatives], random).slice(0, 3), correctAnswer], random);
}

export function pointsForCorrect(previousStreak) {
  return 10 + (previousStreak >= 2 ? previousStreak : 0);
}

export function normalizeRanking(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry) => entry && typeof entry.nome === "string" && entry.nome.trim()
      && Number.isInteger(entry.pontos) && entry.pontos >= 0
      && typeof entry.medalha === "string" && typeof entry.data === "string")
    .map((entry) => ({ ...entry, nome: entry.nome.trim() }))
    .sort((first, second) => second.pontos - first.pontos)
    .slice(0, 10);
}

export function addRankingEntry(currentEntries, name, points, date) {
  const entries = normalizeRanking(currentEntries);
  const validName = name.trim();
  if (!validName || !Number.isInteger(points) || points < 0) {
    return { entries, position: -1 };
  }

  const position = entries.filter((entry) => entry.pontos >= points).length + 1;
  entries.push({ nome: validName, pontos: points, medalha: medalFor(points), data: date });
  entries.sort((first, second) => second.pontos - first.pontos);

  return {
    entries: entries.slice(0, 10),
    position: position <= 10 ? position : -1,
  };
}
