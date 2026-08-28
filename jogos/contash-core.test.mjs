import test from "node:test";
import assert from "node:assert/strict";
import {
  addRankingEntry,
  answerFor,
  generateEquation,
  generateOptions,
  levelFor,
  medalFor,
  pointsForCorrect,
} from "./contash-core.mjs";

test("nível acompanha as faixas do aplicativo", () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(99), 1);
  assert.equal(levelFor(100), 2);
  assert.equal(levelFor(199), 2);
  assert.equal(levelFor(200), 3);
});

test("medalhas acompanham as faixas do aplicativo", () => {
  assert.equal(medalFor(49), "🌟 Iniciante");
  assert.equal(medalFor(50), "🥉 Bronze");
  assert.equal(medalFor(100), "🥈 Prata");
  assert.equal(medalFor(200), "🥇 Ouro");
});

test("operações calculam respostas inteiras", () => {
  assert.equal(answerFor(5, 4, "+"), 9);
  assert.equal(answerFor(5, 4, "-"), 1);
  assert.equal(answerFor(5, 4, "×"), 20);
  assert.equal(answerFor(20, 4, "÷"), 5);
});

test("equações respeitam os limites e divisão exata", () => {
  for (const operation of ["+", "-", "×", "÷"]) {
    for (let index = 0; index < 200; index += 1) {
      const equation = generateEquation([operation], 3);
      assert.ok(equation.number1 >= 1);
      assert.ok(equation.number2 >= 1);
      if (operation === "-") assert.ok(equation.number1 > equation.number2);
      if (operation === "÷") assert.equal(equation.number1 % equation.number2, 0);
    }
  }
});

test("alternativas são distintas, não negativas e incluem a correta", () => {
  for (const level of [1, 2, 3]) {
    for (const answer of [0, 1, 5, 25]) {
      const options = generateOptions(answer, level);
      assert.equal(options.length, 4);
      assert.equal(new Set(options).size, 4);
      assert.ok(options.includes(answer));
      assert.ok(options.every((value) => value >= 0));
    }
  }
});

test("bônus de sequência começa no terceiro acerto", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(pointsForCorrect), [10, 10, 12, 13, 14]);
});

test("ranking mantém empate atrás, aceita zero e limita a dez", () => {
  const initial = Array.from({ length: 10 }, (_, index) => ({
    nome: `Jogador ${index}`,
    pontos: 100 - index * 10,
    medalha: medalFor(100 - index * 10),
    data: "28/08/26",
  }));
  const tied = addRankingEntry(initial, "Empate", 100, "28/08/26");
  assert.equal(tied.position, 2);
  assert.equal(tied.entries[1].nome, "Empate");
  assert.equal(tied.entries.length, 10);

  const zero = addRankingEntry([], "Iniciante", 0, "28/08/26");
  assert.equal(zero.position, 1);
  assert.equal(zero.entries[0].pontos, 0);
});
