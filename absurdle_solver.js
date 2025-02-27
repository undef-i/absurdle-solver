class AbsurdleSolver {
    constructor(dictionary, targetWord) {
        this.wordLength = targetWord.length;
        this.targetWord = targetWord.toLowerCase();
        this.possibleWords = new Set(dictionary.filter(word => word.length === this.wordLength));
        this.allWords = new Set(this.possibleWords);
        this.guessedWords = new Set();
        this._patternCache = new Map();
    }

    _getPattern(guess, target) {
        const cacheKey = guess + target;
        if (this._patternCache.has(cacheKey)) {
            return this._patternCache.get(cacheKey);
        }

        const pattern = Array(this.wordLength).fill('0');
        const used = Array(this.wordLength).fill(false);

        for (let i = 0; i < this.wordLength; i++) {
            if (guess[i] === target[i]) {
                pattern[i] = '2';
                used[i] = true;
            }
        }

        for (let i = 0; i < this.wordLength; i++) {
            if (pattern[i] === '0') {
                for (let j = 0; j < this.wordLength; j++) {
                    if (!used[j] && guess[i] === target[j] && guess[j] !== target[j]) {
                        pattern[i] = '1';
                        used[j] = true;
                        break;
                    }
                }
            }
        }

        const result = pattern.join('');
        this._patternCache.set(cacheKey, result);
        return result;
    }

    _calculateEntropyLoss(pattern) {
        let entropy = 0;
        const length = pattern.length;

        for (let i = 0; i < length; i++) {
            const value = parseInt(pattern[i]);
            entropy += value * Math.pow(10, length - i - 1);
            entropy += Math.pow(10, length + value);
        }

        return -entropy;
    }

    _evaluateGuess(guess) {
        const patternToWords = new Map();
        
        for (const word of this.possibleWords) {
            const pattern = this._getPattern(guess, word);
            if (!patternToWords.has(pattern)) {
                patternToWords.set(pattern, new Set());
            }
            patternToWords.get(pattern).add(word);
        }

        return new Map([...patternToWords.entries()].sort());
    }

    _predictAbsurdlePattern(guess) {
        const patternGroups = this._evaluateGuess(guess);
        const maxSize = Math.max(...[...patternGroups.values()].map(words => words.size));
        
        const maxPatterns = [...patternGroups.entries()]
            .filter(([_, words]) => words.size === maxSize)
            .map(([pattern]) => pattern);

        const patternScores = [];
        const targetPatterns = [];

        for (const pattern of maxPatterns) {
            const entropy = this._calculateEntropyLoss(pattern);
            patternScores.push([pattern, entropy]);
            if (patternGroups.get(pattern).has(this.targetWord)) {
                targetPatterns.push([pattern, entropy]);
            }
        }

        if (targetPatterns.length === 0) return null;

        const minEntropy = Math.max(...patternScores.map(p => p[1]));
        const targetMinEntropy = Math.max(...targetPatterns.map(p => p[1]));
        const targetMinPatterns = targetPatterns
            .filter(([_, entropy]) => entropy === targetMinEntropy)
            .map(([pattern]) => pattern);

        if (targetMinPatterns.some(p => patternScores.some(([pattern, entropy]) => 
            pattern === p && entropy === minEntropy))) {
            return targetMinPatterns[0];
        }

        return null;
    }

    makeGuess() {
        if (this.possibleWords.size === 1) {
            return this.targetWord;
        }

        return this.possibleWords.size > 100 ? 
            this._makeHeuristicGuess() : 
            this._makeOptimalGuess();
    }

    _makeHeuristicGuess() {
        const targetLetters = new Set(this.targetWord);
        const candidates = [...this.allWords]
            .filter(word => !this.guessedWords.has(word))
            .sort(() => Math.random() - 0.5)
            .slice(0, 100);

        let bestGuess = null;
        let bestScore = Infinity;
        let bestTargetLetters = Infinity;

        for (const guess of candidates) {
            const patternGroups = this._evaluateGuess(guess);
            const maxSize = Math.max(...[...patternGroups.values()].map(words => words.size));
            
            const maxGroup = [...patternGroups.entries()]
                .find(([_, words]) => words.size === maxSize)[1];

            if (maxGroup.has(this.targetWord)) {
                const targetLettersUsed = [...guess].filter(c => targetLetters.has(c)).length;
                if (maxSize < bestScore || 
                    (maxSize === bestScore && targetLettersUsed < bestTargetLetters)) {
                    bestScore = maxSize;
                    bestTargetLetters = targetLettersUsed;
                    bestGuess = guess;
                }
            }
        }

        if (bestGuess) {
            this.guessedWords.add(bestGuess);
            return bestGuess;
        }
        return null;
    }

    _makeOptimalGuess() {
        return this._makeHeuristicGuess();
    }

    updatePossibleWords(guess, pattern) {
        const newPossible = new Set();
        for (const word of this.possibleWords) {
            if (this._getPattern(guess, word) === pattern) {
                newPossible.add(word);
            }
        }

        if (!newPossible.has(this.targetWord)) {
            throw new Error(`Failed to update possible words for guess: ${guess} and pattern: ${pattern}`);
        }

        this.possibleWords = newPossible;
    }
}

function patternToEmoji(pattern) {
    return pattern
        .replace(/0/g, '⬜')
        .replace(/1/g, '🟨')
        .replace(/2/g, '🟩');
}

let DICTIONARY = [];

async function loadDictionary() {
    const response = await fetch('dictionary.txt');
    const text = await response.text();
    DICTIONARY = text.split('\n')
        .map(word => word.trim().toLowerCase())
        .filter(word => word);
}

function findSolutionPath(targetWord) {
    const triedGuesses = new Set();
    const guessesHistory = [];
    let solver = new AbsurdleSolver(DICTIONARY, targetWord);

    while (true) {
        const guess = solver.makeGuess();

        if (!guess || triedGuesses.has(guess)) {
            if (guessesHistory.length === 0) return null;

            const [lastGuess] = guessesHistory.pop();
            solver.guessedWords.delete(lastGuess);

            solver = new AbsurdleSolver(DICTIONARY, targetWord);
            solver.guessedWords = new Set(triedGuesses);

            for (const [g, p] of guessesHistory) {
                solver.updatePossibleWords(g, p);
            }
            continue;
        }

        triedGuesses.add(guess);
        const predictedPattern = solver._predictAbsurdlePattern(guess);
        
        if (!predictedPattern) continue;

        try {
            solver.updatePossibleWords(guess, predictedPattern);
            guessesHistory.push([guess, predictedPattern]);

            if (predictedPattern === '2'.repeat(solver.wordLength)) {
                return guessesHistory;
            }
        } catch {
            continue;
        }
    }
}

async function solvePuzzle() {
    const targetWord = document.getElementById('targetWord').value.trim().toLowerCase();
    const solutionDiv = document.getElementById('solution');
    
    if (!targetWord) {
        solutionDiv.innerHTML = '<p class="error">Please enter a target word.</p>';
        return;
    }

    if (DICTIONARY.length === 0) {
        solutionDiv.innerHTML = '<p>Loading dictionary...</p>';
        await loadDictionary();
    }

    const solution = findSolutionPath(targetWord);
    
    if (!solution) {
        solutionDiv.innerHTML = '<p class="error">No valid solution found.</p>';
        return;
    }

    let html = `<table class="absurdle__guess-table"><tbody>`;
    
    solution.forEach(([guess, pattern]) => {
        html += '<tr>';
        for (let i = 0; i < guess.length; i++) {
            const boxClass = pattern[i] === '0' ? 'wrong' : 
                           pattern[i] === '1' ? 'inexact' : 'exact';
            html += `<td class="absurdle__guess-box absurdle__guess-box--${boxClass}">${guess[i].toUpperCase()}</td>`;
        }
        html += '</tr>';
    });
    
    html += `</tbody></table>`;
    html += `<p class="result-text">Target word: ${targetWord.toUpperCase()}</p>`;
    html += `<p>Solved in ${solution.length} steps!</p>`;
    
    solutionDiv.innerHTML = html;
}

window.addEventListener('load', loadDictionary); 