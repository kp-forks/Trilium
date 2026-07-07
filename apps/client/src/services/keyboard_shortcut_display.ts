/**
 * Translatable, display-only formatting of keyboard shortcut strings.
 *
 * Shortcuts are *stored* in a canonical, language-independent format (e.g. `Ctrl+Shift+J`,
 * `Alt+Left`, `Meta+Plus`). That stored form is load-bearing — it drives keystroke matching,
 * conflict detection, option persistence, and Electron global-shortcut registration — so it must
 * never be translated. This module translates a shortcut only at the moment it is *shown* to the
 * user, leaving the stored value untouched.
 *
 * The single rule is: split the shortcut on `+`, then look up each token in {@link TRANSLATABLE_KEYS}.
 * A token found in the table is replaced by its translated (or default English) label; a token not in
 * the table — letters, digits, function keys, punctuation — is emitted verbatim, since those are
 * identical across languages.
 *
 * The core is a pure function that takes an injected `translate` callback, so it can be unit-tested
 * (and used) without booting the i18n runtime. Callers that want localized output pass a `translate`
 * that resolves `${SHORTCUT_KEY_PREFIX}.<id>`.
 */

import { t } from "./i18n.js";

/** i18n key prefix under which the per-token labels live once this mapper is wired to translations. */
export const SHORTCUT_KEY_PREFIX = "keyboard_shortcut_keys";

/** Resolves a token id (e.g. `"ctrl"`) to a localized label, or a nullish value when untranslated. */
export type ShortcutKeyTranslator = (id: string) => string | null | undefined;

const GLOBAL_PREFIX = "global:";

/**
 * Formats a stored shortcut into localized display tokens using the application's i18n runtime. This
 * is the binding every display site should use; {@link formatShortcut} remains available for callers
 * that need to inject their own translator (e.g. tests) or the built-in English defaults.
 */
export function formatShortcutLocalized(shortcut: string): string[] {
    return formatShortcut(shortcut, translateShortcutKey);
}

/**
 * The default i18n-backed token translator: resolves `${SHORTCUT_KEY_PREFIX}.<id>`. Returns
 * `undefined` when the key is missing (i18next echoes the key back), so {@link formatShortcutKey}
 * falls back to the built-in English label.
 */
export function translateShortcutKey(id: string): string | undefined {
    const key = `${SHORTCUT_KEY_PREFIX}.${id}`;
    const value = t(key);
    return value === key ? undefined : value;
}

/**
 * Formats a single stored shortcut string into an ordered list of display tokens. The array is the
 * flexible primitive every display site can build on: wrap each token in its own `<kbd>`, join with
 * `+`, or join with spaces, as that site prefers.
 *
 * A leading `global:` prefix (a storage detail) is stripped so it never leaks into the display.
 *
 * @param shortcut a stored shortcut, e.g. `"Ctrl+Shift+J"`, `"global:Meta+Plus"`, `"F5"`.
 * @param translate optional token-id → label resolver; omit for the built-in English labels.
 */
export function formatShortcut(shortcut: string, translate?: ShortcutKeyTranslator): string[] {
    return splitShortcutForDisplay(shortcut).map((token) => formatShortcutKey(token, translate));
}

/**
 * Splits a stored shortcut into its ordered tokens (modifiers followed by the final key), preserving
 * original casing. Mirrors the plus-key handling of the matcher in `shortcuts.ts`: `+` doubles as the
 * separator, so the plus key is encoded either as the named token `Plus` or as a lone/trailing `+`
 * (`"+"`, or a string ending in `"++"` such as `"Ctrl++"`), all of which yield a `"+"` token here.
 */
export function splitShortcutForDisplay(shortcut: string): string[] {
    const bare = stripGlobalPrefix((shortcut ?? "").trim());
    if (!bare) {
        return [];
    }

    if (bare === "+" || bare.endsWith("++")) {
        const modifiers = bare.slice(0, -1).split("+").filter((part) => part.trim() !== "");
        return [ ...modifiers, "+" ];
    }

    return bare.split("+");
}

/**
 * Translates one shortcut token. Tokens present in {@link TRANSLATABLE_KEYS} (modifiers and named
 * keys, matched case-insensitively) resolve to their localized label, falling back to the built-in
 * English default when `translate` is absent or returns nothing. Any other token — a letter, digit,
 * function key, or punctuation key — is returned unchanged.
 */
export function formatShortcutKey(token: string, translate?: ShortcutKeyTranslator): string {
    const entry = KEY_LABELS[token.toLowerCase()];
    if (!entry) {
        return token;
    }

    // Entries without an `id` are display normalization only (a universal glyph such as "+"), not
    // translation — they never consult the translator and are never exposed as translation keys.
    if (!entry.id) {
        return entry.en;
    }

    const translated = translate?.(entry.id);
    return translated ? translated : entry.en;
}

function stripGlobalPrefix(shortcut: string): string {
    return shortcut.startsWith(GLOBAL_PREFIX) ? shortcut.substring(GLOBAL_PREFIX.length) : shortcut;
}

/**
 * Maps a raw shortcut token (lowercased, aliases collapsed) to its display label. An entry with an
 * `id` is *translatable* — the `id` resolves a per-language label, with `en` as the fallback. An entry
 * without an `id` is *normalization only*: a universal glyph (e.g. the stored word "Plus" shown as
 * "+") that reads identically in every language and must not be offered to translators. Tokens absent
 * from this table — letters, digits, function keys, punctuation — are rendered verbatim.
 */
const KEY_LABELS: Record<string, { id?: string; en: string }> = {
    // Modifiers.
    ctrl: { id: "ctrl", en: "Ctrl" },
    control: { id: "ctrl", en: "Ctrl" },
    // Resolved to a concrete modifier server-side; folded to Ctrl here defensively for display.
    commandorcontrol: { id: "ctrl", en: "Ctrl" },
    alt: { id: "alt", en: "Alt" },
    shift: { id: "shift", en: "Shift" },
    meta: { id: "meta", en: "Meta" },
    cmd: { id: "meta", en: "Meta" },
    command: { id: "meta", en: "Meta" },

    // Named keys.
    enter: { id: "enter", en: "Enter" },
    return: { id: "enter", en: "Enter" },
    escape: { id: "escape", en: "Esc" },
    esc: { id: "escape", en: "Esc" },
    delete: { id: "delete", en: "Delete" },
    del: { id: "delete", en: "Delete" },
    backspace: { id: "backspace", en: "Backspace" },
    space: { id: "space", en: "Space" },
    tab: { id: "tab", en: "Tab" },
    home: { id: "home", en: "Home" },
    end: { id: "end", en: "End" },
    pageup: { id: "page_up", en: "Page Up" },
    pagedown: { id: "page_down", en: "Page Down" },
    // Arrow keys: the physical keycap is the glyph itself and it reads identically in every language,
    // so these are normalization-only (no `id`, never translated), like the plus key below.
    up: { en: "↑" },
    arrowup: { en: "↑" },
    down: { en: "↓" },
    arrowdown: { en: "↓" },
    left: { en: "←" },
    arrowleft: { en: "←" },
    right: { en: "→" },
    arrowright: { en: "→" },
    // The plus key is stored as the named token `Plus`; normalized to the universal "+" glyph. No
    // `id`: "+" is language-neutral, so it is never routed through translation.
    plus: { en: "+" },
    "+": { en: "+" },
    insert: { id: "insert", en: "Insert" },
    ins: { id: "insert", en: "Insert" }
};
