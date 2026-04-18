# Bookmarks
> [!NOTE]
> Not to be confused with [bookmarked notes](../../Basic%20Concepts%20and%20Features/Navigation/Bookmarks.md), which simply pins a particular note to the <a class="reference-link" href="../../Basic%20Concepts%20and%20Features/UI%20Elements/Launch%20Bar.md">Launch Bar</a> for easy access.

Bookmarks allows creating [links](Links.md) to a certain part of a note, such as referencing a particular heading or section within a note.

Technically, bookmarks are HTML anchors.

This feature was introduced in TriliumNext 0.94.0.

## Interaction

*   To create a bookmark:
    *   Place the cursor at the desired position where to place the bookmark.
    *   Look for the <img src="Bookmarks_plus.png" width="15" height="16"> button in the <a class="reference-link" href="Formatting%20toolbar.md">Formatting toolbar</a>, and then press the <img src="1_Bookmarks_plus.png" width="12" height="15"> button.
    *   Alternatively, use <a class="reference-link" href="Premium%20features/Slash%20Commands.md">Slash Commands</a> and look for _Bookmark_.
*   To place a link to a bookmark:
    *   Place the cursor at the desired position of the link.
    *   From the [link](Links.md) pane, select the _Bookmarks_ section and select the desired bookmark.

## Linking across notes

Trilium v0.103.0 introduces cross-note bookmarks, which makes it possible to create <a class="reference-link" href="Links/Internal%20(reference)%20links.md">Internal (reference) links</a> which point to a specific bookmark in that document.

To do so:

1.  First, create a bookmark in the target note using the same process as described above.
2.  In another note, press <kbd>Ctrl</kbd>+<kbd>L</kbd> to insert an internal link. Select the target note containing bookmarks.
3.  If the target note contains bookmarks, a section will appear underneath the note selector with the list of bookmarks.
4.  Add the link normally.

Clicking on a reference link pointing to a bookmark will automatically scroll to the desired section.

> [!NOTE]
> For notes created prior to Trilium v0.103.0, you might notice that the bookmarks might not be identified:
> 
> *   To fix this, simply go that note and make any change (e.g. inserting a space), this will trigger the recalculation of the links.
> *   This limitation is intentional in order not to have to re-process all the notes, looking for anchors.