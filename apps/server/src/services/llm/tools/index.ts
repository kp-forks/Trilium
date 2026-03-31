/**
 * LLM tools that wrap existing Trilium services.
 * These reuse the same logic as ETAPI without any HTTP overhead.
 */

export { noteTools, currentNoteTools } from "./note_tools.js";
export { attributeTools } from "./attribute_tools.js";
