# Notion
> [!NOTE]
> This import mechanism was introduced in Trilium v0.104.0.

Trilium can import ZIP exports from Notion while preserving structure and formatting.

## Import process

In Notion, there are two ways to export data:

*   To export a single page (and optionally its sub-pages):
    *   Select the page to export.
    *   Press the \[…\] button at the top-right of the window and select _Export_.
    *   Ensure the following options are set:
        *   Export format: HTML
        *   Page content: Everything
        *   Include subpages: On
        *   Create folders for subpages: On
    *   Press the Export button.
    *   Wait for the download to finish.
*   To export an entire workspace, press your user name badge at top-left and select _Settings_.
    *   In the left section, look for the _Workspace_ category and select _General_.
    *   In the _General_ settings page, look for the _Export_ section and press the _Export_ button corresponding to _Workspace content_.
    *   Ensure the following options are set:
        *   Export format: HTML
        *   Page content: Everything
        *   Include subpages: On
        *   Create folders for subpages: On
    *   Press the Export button.
    *   Wait for the download to finish. Depending on the size of your workspace it might take a while. You will get a downloadable copy via email if takes too long.

In Trilium Notes:

1.  In the <a class="reference-link" href="../../UI%20Elements/Note%20Tree.md">Note Tree</a>, select a note where to place the imported notes.
2.  From <a class="reference-link" href="../../UI%20Elements/Note%20buttons.md">Note buttons</a>, select _Import from a service…_
3.  Select _Notion_ as the provider to import from.
4.  Upload the ZIP obtained in the previous step.

## Supported features

The following features are preserved by Trilium during the import process:

*   Basic formatting (bold, italic, underline, strikethrough, headings, colors, highlights).
*   <a class="reference-link" href="../../../Note%20Types/Text/Lists.md">Lists</a>
*   To-do lists
*   <a class="reference-link" href="../../../Note%20Types/Text/Images.md">Images</a> and <a class="reference-link" href="../../Notes/Attachments.md">Attachments</a>.
*   Toggle sections
*   <a class="reference-link" href="../../../Note%20Types/Text/Math%20Equations.md">Math Equations</a> (inline or block)
*   <a class="reference-link" href="../../../Note%20Types/Text/Link%20Previews.md">Link Previews</a>
*   <a class="reference-link" href="../../../Note%20Types/Text/Developer-specific%20formatting/Code%20blocks.md">Code blocks</a>, with a best-effort attempt to restore the language.
*   <a class="reference-link" href="../../../Note%20Types/Mermaid%20Diagrams.md">Mermaid Diagrams</a>
*   Links between other imported pages are converted to <a class="reference-link" href="../../../Note%20Types/Text/Links/Internal%20(reference)%20links.md">Internal (reference) links</a> if they are part of the same import.
*   [Admonitions](../../../Note%20Types/Text/Block%20quotes%20%26%20admonitions.md) are preserved, including its emoji (added as part of the content).

## Limitations

### Missing data from the import

The following information is not preserved by the import because it is not available in the export so it cannot be restored:

*   The order of the pages and sub-pages.
*   Creation and modification of pages and sub-pages. For items in a collection, they are restored.

### Collections

Currently the import does not fully handle collections. Items that belong in a collection are properly positioned but the fields/metadata is not preserved and not turned into <a class="reference-link" href="../../../Collections.md">Collections</a>.

### Page attributes

Currently page attributes are not preserved.

### Cover images and page icon

The page icon or emoji is not preserved, with created notes having the default icon. The cover image is not imported at all.

## Reporting issues

When importing your Notion workspace, you might find issues in how a note is imported; in that case consider [reporting](../../../Troubleshooting/Reporting%20issues.md) it.

When reporting such an issue make sure to provide the following information:

*   A .zip export of the original Notion note (and children if applicable). This allows us to reproduce the issue.
*   A screenshot with how it originally looked like before the import and how it looks after the import.