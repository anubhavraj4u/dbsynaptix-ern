// Python original: app/ai/similarity.py
//
// Cosine similarity: how much two vectors point the same way.
//   1 = same direction (same meaning), 0 = unrelated.
// Formula: dot(a, b) / (length(a) * length(b))

export class SimilarityCalculator {
  cosineSimilarity(vector1, vector2) {
    const dot = this.dotProduct(vector1, vector2);
    const magnitude1 = this.magnitude(vector1);
    const magnitude2 = this.magnitude(vector2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0; // avoids dividing by zero
    }

    return dot / (magnitude1 * magnitude2);
  }

  // Multiply matching positions and add them up.
  dotProduct(vector1, vector2) {
    // Python's zip() stops at the shorter list. Math.min does the same here.
    const length = Math.min(vector1.length, vector2.length);
    let result = 0;

    for (let i = 0; i < length; i++) {
      result += vector1[i] * vector2[i];
    }

    return result;
  }

  // Length of a vector: square root of the sum of squares.
  magnitude(vector) {
    let total = 0;

    for (const value of vector) {
      total += value * value;
    }

    return Math.sqrt(total);
  }
}
