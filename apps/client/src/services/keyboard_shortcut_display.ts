/**
 * Translatable, display-only formatting of keyboard shortcut strings.
 *
 * Shortcuts are *stored* in a canonical, language-independent format (e.g. `Ctrl+Shift+J`,
 * `Alt+Left`, `Meta+Plus`). That stored form is load-bearing — it drives keystroke matching,
 * conflict detection, option persistence, and Electron global-shortcut registration — so it must
 * never be translated. This module translates a shortcut only at the moment it is *shown* to the
 * user, leaving the stored value untouched.
 *
 * The single rule is: split the shortcut on `+`, then classify each token:
 *  - a *glyph* token (arrow keys, the plus key) renders a universal symbol — identical in every
 *    language, so it is a constant here and never translated;
 *  - a *translatable* token (modifier or named key) resolves its label entirely through the injected
 *    translator, keyed by an id under {@link SHORTCUT_KEY_PREFIX}; the English source lives in the
 *    translation files, not here;
 *  - any other token — letter, digit, function key, punctuation — is emitted verbatim.
 *
 * The translator is injected so the core is unit-testable with a stub; production callers use
 * {@link formatShortcutLocalized}, which binds the application's i18n runtime.
 */

import { t } from "./i18n.js";

/** i18n key prefix under which the per-token labels live. */
export const SHORTCUT_KEY_PREFIX = "keyboard_shortcut_keys";

/** Resolves a token id (e.g. `"ctrl"`) to its localized label via the translation files. */
export type ShortcutKeyTranslator = (id: string) => string;

const GLOBAL_PREFIX = "global:";

/**
 * Formats a stored shortcut into localized display tokens using the application's i18n runtime. This
 * is the binding every display site should use; {@link formatShortcut} accepts an injected translator
 * for tests.
 */
export function formatShortcutLocalized(shortcut: string): string[] {
    return formatShortcut(shortcut, translateShortcutKey);
}

/** The i18n-backed token translator: resolves `${SHORTCUT_KEY_PREFIX}.<id>` from the translation files. */
export function translateShortcutKey(id: string): string {
    return t(`${SHORTCUT_KEY_PREFIX}.${id}`);
}

/**
 * Formats a single stored shortcut string into an ordered list of display tokens. The array is the
 * flexible primitive every display site can build on: wrap each token in its own `<kbd>`, join with
 * `+`, or join with spaces, as that site prefers.
 *
 * A leading `global:` prefix (a storage detail) is stripped so it never leaks into the display.
 *
 * @param shortcut a stored shortcut, e.g. `"Ctrl+Shift+J"`, `"global:Meta+Plus"`, `"F5"`.
 * @param translate token-id → label resolver (see {@link translateShortcutKey}).
 */
export function formatShortcut(shortcut: string, translate: ShortcutKeyTranslator): string[] {
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
 * Renders one shortcut token (matched case-insensitively): a glyph token ({@link KEY_GLYPHS}) becomes
 * its universal symbol, a translatable token ({@link TRANSLATABLE_KEYS}) is resolved through
 * `translate`, and any other token — letter, digit, function key, punctuation — is returned unchanged.
 */
export function formatShortcutKey(token: string, translate: ShortcutKeyTranslator): string {
    const lower = token.toLowerCase();

    const glyph = KEY_GLYPHS[lower];
    if (glyph) {
        return glyph;
    }

    const id = TRANSLATABLE_KEYS[lower];
    if (id) {
        return translate(id);
    }

    return token;
}

function stripGlobalPrefix(shortcut: string): string {
    return shortcut.startsWith(GLOBAL_PREFIX) ? shortcut.substring(GLOBAL_PREFIX.length) : shortcut;
}

/**
 * Tokens rendered as a universal glyph — the arrow keys (whose keycap *is* the glyph) and the plus key
 * (stored as the named token `Plus`). These read identically in every language, so they are constants
 * and are never routed through translation.
 */
const KEY_GLYPHS: Record<string, string> = {
    up: "↑", arrowup: "↑",
    down: "↓", arrowdown: "↓",
    left: "←", arrowleft: "←",
    right: "→", arrowright: "→",
    plus: "+", "+": "+"
};

/**
 * Maps a raw shortcut token (lowercased, aliases collapsed) to its translation id under
 * {@link SHORTCUT_KEY_PREFIX}. Only modifiers and named keys — the parts that differ across languages —
 * appear here; their labels come from the translation files, never hard-coded in this module.
 */
const TRANSLATABLE_KEYS: Record<string, string> = {
    // Modifiers. `CommandOrControl` is resolved to a concrete modifier server-side; folded to Ctrl
    // here defensively for display.
    ctrl: "ctrl",
    control: "ctrl",
    commandorcontrol: "ctrl",
    alt: "alt",
    shift: "shift",
    meta: "meta",
    cmd: "meta",
    command: "meta",

    // Named keys.
    enter: "enter",
    return: "enter",
    escape: "escape",
    esc: "escape",
    delete: "delete",
    del: "delete",
    backspace: "backspace",
    space: "space",
    tab: "tab",
    home: "home",
    end: "end",
    pageup: "page_up",
    pagedown: "page_down",
    insert: "insert",
    ins: "insert"
};
