import oneNoteProvider from "./onenote.js";
import type { ImportProvider } from "./types.js";

/**
 * Registry of available import providers. Append new providers here; the generic import dialog
 * renders the picker and each provider's panel automatically.
 */
export const importProviders: ImportProvider[] = [oneNoteProvider];

export type { ImportProvider, ImportProviderPanelProps } from "./types.js";
