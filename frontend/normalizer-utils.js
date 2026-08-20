(function (root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.NormalizerUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const invisibleCharacters = new Set([
    "\u00AD",
    "\u200B",
    "\u200C",
    "\u200D",
    "\u200E",
    "\u200F",
    "\u2060",
    "\uFEFF"
  ]);

  const characterReplacements = {
    "…": "...",
    "½": "1/2",
    "⅓": "1/3",
    "⅔": "2/3",
    "¼": "1/4",
    "¾": "3/4",
    "⅕": "1/5",
    "⅖": "2/5",
    "⅗": "3/5",
    "⅘": "4/5",
    "⅙": "1/6",
    "⅚": "5/6",
    "⅛": "1/8",
    "⅜": "3/8",
    "⅝": "5/8",
    "⅞": "7/8",
    "™": "(TM)",
    "®": "(R)",
    "©": "(C)",
    "‰": " per mille",
    "§": "",
    "¶": "",
    "←": "",
    "↑": "",
    "→": "",
    "↓": "",
    "⁰": "",
    "¹": "",
    "²": "",
    "³": "",
    "⁴": "",
    "⁵": "",
    "⁶": "",
    "⁷": "",
    "⁸": "",
    "⁹": "",
    "₀": "0",
    "₁": "1",
    "₂": "2",
    "₃": "3",
    "₄": "4",
    "₅": "5",
    "₆": "6",
    "₇": "7",
    "₈": "8",
    "₉": "9",
    "°": "degree"
  };

  const dashCharacters = new Set(["‐", "‑", "‒", "–", "—", "―"]);
  const smartQuoteCharacters = new Set(["“", "”", "„", "‟", "«", "»"]);
  const apostropheCharacters = new Set(["‘", "’", "‚", "‛", "‹", "›", "′", "ʼ", "`"]);
  const bulletCharacter = "•";

  function createStats() {
    return {
      smartQuotes: 0,
      charactersNormalized: 0,
      invisibleDeleted: 0,
      unsafeLinksRemoved: 0,
      links: []
    };
  }

  function removeAccents(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function hasMojibakeAt(text, position) {
    const mojibakeSequences = [
      "â€™",
      "â“",
      "â€\u009D",
      "â–",
      "â—",
      "â…",
      "Â®",
      "Â©",
      "Â°",
      "Â ",
      "Ã©",
      "Ã¨",
      "Ã¼",
      "Ã¶",
      "Ã±",
      "Ã¡",
      "Ã³"
    ];

    return mojibakeSequences.find(sequence =>
      text.slice(position, position + sequence.length) === sequence
    );
  }

  function isListBullet(text, index) {
    const lineStart = text.lastIndexOf("\n", index - 1);
    const lineEnd = text.indexOf("\n", index);
    const lineSegment = text.slice(
      lineStart + 1,
      lineEnd === -1 ? undefined : lineEnd
    );
    const beforeBullet = lineSegment.slice(0, index - (lineStart + 1));

    return beforeBullet.trim() === "";
  }

  function findMatchingBracket(text, startIndex) {
    let depth = 0;

    for (let index = startIndex; index < text.length; index++) {
      const character = text[index];

      if (character === "[") {
        depth += 1;
      } else if (character === "]") {
        depth -= 1;

        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }

  function isLikelyStructuredBracket(text, openBracketIndex, closeBracketIndex) {
    if (closeBracketIndex === -1) {
      return false;
    }

    const inside = text.slice(openBracketIndex + 1, closeBracketIndex);

    if (!inside) {
      return false;
    }

    if (/^https?:\/\//i.test(inside) || /^www\./i.test(inside)) {
      return true;
    }

    if (/^[0-9,\s.-]+$/.test(inside)) {
      return true;
    }

    if (inside.includes(":") || inside.includes("/") || inside.includes("#") || inside.includes("@")) {
      return true;
    }

    return false;
  }

  function normalizeTextValue(text, stats = createStats()) {
    let output = "";
    const bracketStack = [];

    for (let index = 0; index < text.length; index++) {
      const mojibake = hasMojibakeAt(text, index);

      if (mojibake) {
        index += mojibake.length - 1;
        continue;
      }

      const character = text[index];

      if (invisibleCharacters.has(character)) {
        stats.invisibleDeleted += 1;
        continue;
      }

      if (character === "[") {
        const closeBracketIndex = findMatchingBracket(text, index);

        if (closeBracketIndex !== -1 && isLikelyStructuredBracket(text, index, closeBracketIndex)) {
          bracketStack.push(true);
          output += character;
          continue;
        }

        bracketStack.push(false);
        output += "(";
        stats.charactersNormalized += 1;
        continue;
      }

      if (character === "]") {
        const shouldPreserve = bracketStack.pop() === true;

        output += shouldPreserve ? character : ")";

        if (!shouldPreserve) {
          stats.charactersNormalized += 1;
        }

        continue;
      }

      if (character === bulletCharacter && !isListBullet(text, index)) {
        output += " ";
        stats.charactersNormalized += 1;

        if (index + 1 < text.length && /\s/.test(text[index + 1])) {
          index += 1;
        }

        continue;
      }

      if (character === bulletCharacter) {
        output += character;
        continue;
      }

      const accentFreeCharacter = removeAccents(character);

      if (accentFreeCharacter !== character) {
        output += accentFreeCharacter;
        stats.charactersNormalized += 1;
        continue;
      }

      if (smartQuoteCharacters.has(character)) {
        const replacement = '"';
        output += replacement;
        stats.smartQuotes += 1;
        stats.charactersNormalized += 1;
        continue;
      }

      if (apostropheCharacters.has(character)) {
        output += "'";
        stats.smartQuotes += 1;
        stats.charactersNormalized += 1;
        continue;
      }

      if (dashCharacters.has(character)) {
        output += "-";
        stats.charactersNormalized += 1;
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(characterReplacements, character)) {
        output += characterReplacements[character];
        stats.charactersNormalized += 1;
        continue;
      }

      output += character;
    }

    return {
      text: output,
      stats
    };
  }

  function insertHtmlAtPosition(existingHtml, insertedHtml, position) {
    if (position < 0 || position > existingHtml.length) {
      position = existingHtml.length;
    }

    return existingHtml.slice(0, position) + insertedHtml + existingHtml.slice(position);
  }

  return {
    createStats,
    normalizeTextValue,
    insertHtmlAtPosition,
    removeAccents,
    isListBullet,
    findMatchingBracket,
    isLikelyStructuredBracket
  };
});
