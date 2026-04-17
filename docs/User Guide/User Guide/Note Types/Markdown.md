# Markdown
Trilium has always supported Markdown through its [import feature](../Basic%20Concepts%20and%20Features/Import%20%26%20Export/Markdown.md), however the file was either transformed to a <a class="reference-link" href="Text.md">Text</a> note (converted to Trilium's internal HTML format) or saved as a <a class="reference-link" href="Code.md">Code</a> note with only syntax highlight.

v0.103.0 introduces a new note type: Markdown which which displays Markdown source and a preview on the right.

## Rationale

The goal of this note type is to fill a gap: rendering Markdown but not altering its structure or its whitespace which would inevitably change otherwise through import/export.

Even if Markdown is now specially treated by having a preview mechanism, Trilium remains at its core a WYSWYG editor so Markdown will not replace text notes.

> [!NOTE]
> Feature requests regarding the Markdown implementation will be considered, but if they are outside the realm of Trilium they will not be implemented. One of the core aspects of the Markdown integration is that it reuses components that are already available through other features of the application.

## Creating Markdown notes

There are two ways to create a Markdown note:

1.  Create a new note (e.g. in the <a class="reference-link" href="../Basic%20Concepts%20and%20Features/UI%20Elements/Note%20Tree.md">Note Tree</a>) and select the type _Markdown_, just like all the other note types.
2.  Create a note of type <a class="reference-link" href="Code.md">Code</a> and select as the language either _Markdown_ or _GitHub-Flavored Markdown_. This maintains compatibility with your existing notes prior to the introduction of this feature.

## Supported features in preview

The following features are supported by Trilium's Markdown format and will show up in the preview pane:

*   All standard and GitHub-flavored syntax (basic formatting, tables, blockquotes)
*   Code blocks with syntax highlight (e.g. ` ```js `) and automatic syntax highlight
*   <a class="reference-link" href="Text/Block%20quotes%20%26%20admonitions.md">Block quotes &amp; admonitions</a>
*   <a class="reference-link" href="Text/Math%20Equations.md">Math Equations</a>
*   <a class="reference-link" href="Mermaid%20Diagrams.md">Mermaid Diagrams</a> using ` ```mermaid `
*   <a class="reference-link" href="Text/Include%20Note.md">Include Note</a> (no builtin Markdown syntax, but HTML syntax works just fine):
    
    ```
    <section class="include-note" data-note-id="vJDjQm0VK8Na" data-box-size="expandable">
    	&nbsp;
    </section>
    ```
*   <a class="reference-link" href="Text/Links/Internal%20(reference)%20links.md">Internal (reference) links</a> via its HTML syntax, or through a _Wikilinks_\-like format (only <a class="reference-link" href="../Advanced%20Usage/Note%20ID.md">Note ID</a>):
    
    ```
    [[Hg8TS5ZOxti6]]
    ```

## Sync-scrolling

When scrolling through the editing pane, the preview pane will attempt to synchronize its position to make it easier to see the preview.

This feature cannot be disabled as of now; if the scrolling feels distracting, consider temporarily switching to the editor mode and then switching to preview mode when ready.

> [!NOTE]
> This feature of synchronizing the scroll is based on blocks but it's provided on a best-effort basis since our underlying Markdown library doesn't support this feature natively, so we had to implement our own algorithm. Feel free to [report issues](../Troubleshooting/Reporting%20issues.md), but always provide a sample Markdown file to be able to reproduce it.