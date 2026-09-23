# Note Tags
Every built-in note tag OneNote can apply, and what the importer writes in its place. Trilium draws an icon in the paragraph's own colour and size, so a tag inherits whatever formatting surrounds it, and the icon's name is added to the note's searchable text.

Custom tags are not supported by the OneNote API and never reach the importer.

### Decorative tags

These stay paragraphs, with the glyph written in front of the text. A paragraph can carry several tags at once, in which case their glyphs stack.

| OneNote tag | `data-tag` | Imported as | Searchable as |
| --- | --- | --- | --- |
| Important | `important` | <span class="tn-icon bx bx-star"></span> | `star` |
| Critical | `critical` | <span class="tn-icon bx bx-error-circle"></span> | `error-circle` |
| Question | `question` | <span class="tn-icon bx bx-help-circle"></span> | `help-circle` |
| Highlight | `highlight` | <span class="tn-icon bx bx-highlight"></span> | `highlight` |
| Definition | `definition` | <span class="tn-icon bx bx-pin"></span> | `pin` |
| Remember for later | `remember-for-later` | <span class="tn-icon bx bx-pin"></span> | `pin` |
| Remember for blog | `remember-for-blog` | <span class="tn-icon bx bx-edit"></span> | `edit` |
| Idea | `idea` | <span class="tn-icon bx bx-bulb"></span> | `bulb` |
| Password | `password` | <span class="tn-icon bx bx-key"></span> | `key` |
| Contact | `contact` | <span class="tn-icon bx bx-user"></span> | `user` |
| Address | `address` | <span class="tn-icon bx bx-home"></span> | `home` |
| Phone number | `phone-number` | <span class="tn-icon bx bx-phone"></span> | `phone` |
| Web site to visit | `web-site-to-visit` | <span class="tn-icon bx bx-globe"></span> | `globe` |
| Source for article | `source-for-article` | <span class="tn-icon bx bx-news"></span> | `news` |
| Send in email | `send-in-email` | <span class="tn-icon bx bx-envelope"></span> | `envelope` |
| Movie to see | `movie-to-see` | <span class="tn-icon bx bx-movie"></span> | `movie` |
| Book to read | `book-to-read` | <span class="tn-icon bx bx-book"></span> | `book` |
| Music to listen to | `music-to-listen-to` | <span class="tn-icon bx bx-music"></span> | `music` |
| Project A | `project-a` | 🅰️ | 🅰️ |
| Project B | `project-b` | 🅱️ | 🅱️ |

### Check box tags

These become task list items, with the glyph inside the item. A run of consecutive ones becomes a single list, and a tag OneNote marked completed arrives with its box ticked.

| OneNote tag | `data-tag` | Imported as | Searchable as |
| --- | --- | --- | --- |
| To Do | `to-do` | _(none)_ | — |
| To Do priority 1 | `to-do-priority-1` | 1️⃣ | 1️⃣ |
| To Do priority 2 | `to-do-priority-2` | 2️⃣ | 2️⃣ |
| Discuss with Person A | `discuss-with-person-a` | <span class="tn-icon bx bx-message-rounded"></span> | `message-rounded` |
| Discuss with Person B | `discuss-with-person-b` | <span class="tn-icon bx bx-message-rounded"></span> | `message-rounded` |
| Discuss with manager | `discuss-with-manager` | <span class="tn-icon bx bx-conversation"></span> | `conversation` |
| Schedule meeting | `schedule-meeting` | <span class="tn-icon bx bx-calendar"></span> | `calendar` |
| Call back | `call-back` | <span class="tn-icon bx bx-phone-call"></span> | `phone-call` |
| Client request | `client-request` | <span class="tn-icon bx bx-clipboard"></span> | `clipboard` |

### Notes

*   **Project A**, **Project B**, **To Do priority 1** and **To Do priority 2** keep an emoji rather than an icon. Their glyph is a letter or a number, and the icon pack has neither, so no icon could tell one from the other. These four are the only tags not findable by name.
*   **Definition** is imported as a pin rather than a book: the OneNote API returns both the Definition and the Remember for later tag as `remember-for-later`, so the two are indistinguishable by the time the page reaches Trilium.
*   **To Do** is a plain tick box with no glyph, as it is in OneNote.