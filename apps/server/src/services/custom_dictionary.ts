import type { Session } from "electron";

import becca from "../becca/becca.js";
import log from "./log.js";

const DICTIONARY_NOTE_ID = "_customDictionary";

/**
 * Reads the custom dictionary words from the hidden note.
 */
function getWords(): Set<string> {
    const note = becca.getNote(DICTIONARY_NOTE_ID);
    if (!note) {
        return new Set();
    }

    const content = note.getContent();
    if (typeof content !== "string" || !content.trim()) {
        return new Set();
    }

    return new Set(
        content.split("\n")
            .map((w) => w.trim())
            .filter((w) => w.length > 0)
    );
}

/**
 * Saves the given words to the custom dictionary note, one per line.
 */
function saveWords(words: Set<string>) {
    const note = becca.getNote(DICTIONARY_NOTE_ID);
    if (!note) {
        log.error("Custom dictionary note not found.");
        return;
    }

    const sorted = [...words].sort((a, b) => a.localeCompare(b));
    note.setContent(sorted.join("\n"));
}

/**
 * Adds a single word to the custom dictionary note.
 */
function addWord(word: string) {
    const words = getWords();
    words.add(word);
    saveWords(words);
}

/**
 * Loads the custom dictionary into Electron's spellchecker session,
 * performing a one-time import of locally stored words on first use.
 */
async function loadForSession(session: Session) {
    const note = becca.getNote(DICTIONARY_NOTE_ID);
    if (!note) {
        log.error("Custom dictionary note not found.");
        return;
    }

    const noteWords = getWords();
    const localWords = await session.listWordsInSpellCheckerDictionary();

    let merged = noteWords;

    // One-time import: if the note is empty but there are local words, import them.
    if (noteWords.size === 0 && localWords.length > 0) {
        log.info(`Importing ${localWords.length} words from local spellchecker dictionary.`);
        merged = new Set(localWords);
        saveWords(merged);
    } else if (noteWords.size > 0 && localWords.length > 0) {
        // Merge both sources so no words are lost.
        const before = noteWords.size;
        for (const w of localWords) {
            merged.add(w);
        }
        if (merged.size > before) {
            log.info(`Merged ${merged.size - before} new words from local dictionary.`);
            saveWords(merged);
        }
    }

    // Load all words into Electron's spellchecker.
    for (const word of merged) {
        session.addWordToSpellCheckerDictionary(word);
    }

    if (merged.size > 0) {
        log.info(`Loaded ${merged.size} custom dictionary words into spellchecker.`);
    }
}

export default {
    getWords,
    saveWords,
    addWord,
    loadForSession
};
