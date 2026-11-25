
import re
from collections import Counter


def find_top_word_patterns(document, k, N):
    """
    Finds the N most frequently occurring word patterns of length k.
    
    Args:
        document: String containing the document to analyze
        k: Pattern length (number of consecutive words)
        N: Number of top patterns to return
    
    Returns:
        List of strings with the N most frequent patterns of length k, sorted by frequency
        (descending) and then alphabetically in case of ties.
    """
    # Clean text: remove punctuation and convert to lowercase
    cleaned_text = re.sub(r'[^\w\s]', '', document.lower())
    
    # Split into words (remove extra spaces)
    words = cleaned_text.split()
    
    # Check if there are enough words to form at least one pattern
    if len(words) < k:
        return []
    
    # Generate all patterns of length k
    patterns = []
    for i in range(len(words) - k + 1):
        pattern = ' '.join(words[i:i + k])
        patterns.append(pattern)
    
    # Count frequencies
    pattern_counts = Counter(patterns)
    
    # Sort by frequency (descending) and then alphabetically
    sorted_patterns = sorted(
        pattern_counts.items(),
        key=lambda x: (-x[1], x[0])  # -x[1] for descending frequency order
    )
    
    # Return the top N patterns (only the strings, not the frequencies)
    result = [pattern for pattern, count in sorted_patterns[:N]]
    
    return result


# Tests
if __name__ == "__main__":
    test = "a b c a b c a b c d e f d e f"
    output_1 = ["a b c", "b c a"]
    result_1 = find_top_word_patterns(test, 3, 2)
    assert result_1 == output_1, result_1
    
    test_2 = "the quick brown fox jumps over the lazy dog. The quick brown fox falls over the fence."
    output_2 = ["quick brown fox", "the quick brown", "brown fox falls"]
    result_2 = find_top_word_patterns(test_2, 3, 3)
    assert result_2 == output_2, result_2
    print("Los dos ejemplos pasaron.")

