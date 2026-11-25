// Python original: app/ai/preprocessing.py
//
// Cleans the question into keywords for the keyword half of the search.
//   "Show total Orders by Customer?"  ->  ["show", "total", "order", "by", "customer"]

export class QueryPreprocessor {
  preprocess(question) {
    const normalized = this.normalize(question);

    let tokens = this.tokenize(normalized);
    tokens = this.singularize(tokens);

    const keywords = this.extractKeywords(tokens);

    return { original: question, normalized, tokens, keywords };
  }

  // Lowercase, remove punctuation, collapse spaces.
  normalize(question) {
    let text = question.toLowerCase();

    // Python: re.sub(r"[^\w\s]", "", text)
    // The "u" flag + \p{L}\p{N} keep letters and digits from any language.
    text = text.replace(/[^\p{L}\p{N}_\s]/gu, "");

    // Python: re.sub(r"\s+", " ", text)
    text = text.replace(/\s+/g, " ");

    return text.trim();
  }

  // Python: normalized.split()   (split on any whitespace, drop empties)
  tokenize(normalizedQuestion) {
    return normalizedQuestion.split(" ").filter((word) => word !== "");
  }

  // Keep each word once, in the order it first appeared.
  // A Set remembers what it has already seen.
  extractKeywords(tokens) {
    const keywords = [];
    const seen = new Set();

    for (const token of tokens) {
      if (!seen.has(token)) {
        keywords.push(token);
        seen.add(token);
      }
    }

    return keywords;
  }

  // Very simple plural -> singular rule: "orders" -> "order", "companies" -> "company".
  // It is crude on purpose. For example "status" becomes "statu".
  singularize(tokens) {
    return tokens.map((token) => {
      if (token.endsWith("ies")) {
        return token.slice(0, -3) + "y"; // Python: token[:-3] + "y"
      }

      if (token.endsWith("s") && token.length > 3) {
        return token.slice(0, -1); // Python: token[:-1]
      }

      return token;
    });
  }
}
