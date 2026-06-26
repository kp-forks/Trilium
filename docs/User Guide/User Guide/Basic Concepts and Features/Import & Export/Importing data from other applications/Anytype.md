# Anytype
Starting with v0.104.0, Trilium is able to import data from Anytype from JSON imports which preserve most of the formatting and the metainformation.

## Import process

The first step is to export the data from Anytype:

*   To export a single page:
    *   Select the page to export.
    *   Press the \[…\] at the top-right of the window and select _Export_.
    *   Ensure the following options are set:
        *   Export format: Any-Block
        *   File Format: JSON
        *   Zip archive: On
        *   Include linked objects: On
        *   Include files: On
        *   Include archived objects: On
*   To export an entire channel:
    *   Select the desired channel from the left bar.
    *   Underneath the channel icon in the left sidebar, press the name of the channel with an arrow and select _Channel Settings_.
    *   In the left sidebar, look for the _Integrations_ section and select _Export_.
    *   Press _Any-Block_.
    *   Ensure the following options are set:
        *   File Format: JSON
        *   Zip archive: On
        *   Include files: On
        *   Include archived objects: On

In Trilium Notes:

1.  In the <a class="reference-link" href="../../UI%20Elements/Note%20Tree.md">Note Tree</a>, right click and select _Import into note_.
2.  In the _Import from_ section, select _Anytype_.
3.  Upload the ZIP.

## Supported features

The following features are preserved by Trilium during the import process:

*   Basic formatting (bold, italic, underline, strikethrough, headings, colors, highlights, inline code).
*   <a class="reference-link" href="../../../Note%20Types/Text/Lists.md">Lists</a> (numbered or bullet)
*   To-do lists
*   Toggle sections
*   Highlight blocks are imported as block quotes.
*   <a class="reference-link" href="../../../Note%20Types/Text/Developer-specific%20formatting/Code%20blocks.md">Code blocks</a>, with a best-effort attempt to restore the language.
*   Links between other imported pages are converted to <a class="reference-link" href="../../../Note%20Types/Text/Links/Internal%20(reference)%20links.md">Internal (reference) links</a> if they are part of the same import.
*   Collections are imported as Trilium-native <a class="reference-link" href="../../../Collections.md">Collections</a> (see below).
*   Dividers (line, dots) are imported as horizontal rules.
*   [Admonitions](../../../Note%20Types/Text/Block%20quotes%20%26%20admonitions.md) are preserved, including its emoji (added as part of the content).
*   Creation and modification date of pages is preserved.

## Collections

Collections created in Anytype are imported on a best-effort basis, preserving both the view mode and the page properties as <a class="reference-link" href="../../../Advanced%20Usage/Attributes/Promoted%20Attributes.md">Promoted Attributes</a>.

The following view modes are supported:

*   List as <a class="reference-link" href="../../../Collections/List%20View.md">List View</a>
*   Gallery as <a class="reference-link" href="../../../Collections/Grid%20View.md">Grid View</a>
*   <a class="reference-link" href="../../../Collections/Calendar.md">Calendar</a>, preserving the attribute which identifies the date.
*   <a class="reference-link" href="../../../Collections/Kanban%20Board.md">Kanban Board</a>, preserving the board group column.
*   <a class="reference-link" href="../../../Collections/Table.md">Table</a>, also used as fallback for unsupported collection layouts.

The following types are supported:

<table><thead><tr><th scope="col">Anytype property type</th><th scope="col">Trilium</th></tr></thead><tbody><tr><td>Text / Select</td><td>Single-valued <code spellcheck="false">text</code> label</td></tr><tr><td>Number</td><td>Single-valued <code spellcheck="false">number</code> label</td></tr><tr><td>Multi-select</td><td>One <code spellcheck="false">text</code> label per option (multi)</td></tr><tr><td>Date / Date with time</td><td><ul><li data-list-item-id="eb2f417ce240ac72c1773231746ecf0c6"><code spellcheck="false">datetime</code> if the time is included.</li><li data-list-item-id="ee9dcf32dba7753df568315409159aa7d"><code spellcheck="false">date</code> if only dates.</li></ul></td></tr><tr><td>File</td><td>The files are preserved as attachments, and a link to them is prepended to the content of the note for visibility.</td></tr><tr><td>Checkbox</td><td><code spellcheck="false">boolean</code> label (<code spellcheck="false">true</code>/<code spellcheck="false">false</code>).</td></tr><tr><td>URL / Email / Phone</td><td><code spellcheck="false">url</code> label (<code spellcheck="false">mailto:</code>, <code spellcheck="false">tel:</code> prefix)</td></tr></tbody></table>