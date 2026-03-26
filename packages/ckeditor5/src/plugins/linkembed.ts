import { ButtonView, Command, Plugin, toWidget, Widget, type Observable } from 'ckeditor5';
import type { Position } from 'ckeditor5';
import linkEmbedIcon from '../icons/link-embed.svg?raw';
import { preventCKEditorHandling } from './widget_utils.js';

export const LINK_EMBED_COMMAND = 'insertLinkEmbed';

const EMBEDDABLE_URL_REGEX = /^https?:\/\/\S+$/;
const YOUTUBE_URL_REGEX = /(?:youtube\.com|youtu\.be)/;

function isEmbeddableUrl(text: string): boolean {
    return EMBEDDABLE_URL_REGEX.test(text.trim());
}

export default class LinkEmbed extends Plugin {
    static get requires() {
        return [LinkEmbedEditing, LinkEmbedUI, LinkEmbedPasteHandler];
    }
}

class LinkEmbedUI extends Plugin {
    init() {
        const editor = this.editor;

        editor.ui.componentFactory.add('linkEmbed', locale => {
            const command = editor.commands.get(LINK_EMBED_COMMAND);
            const buttonView = new ButtonView(locale);

            buttonView.set({
                label: editor.t('Link preview'),
                icon: linkEmbedIcon,
                tooltip: true
            });

            if (command) {
                buttonView.bind('isOn', 'isEnabled').to(
                    command as Observable & { value: boolean } & { isEnabled: boolean },
                    'value', 'isEnabled'
                );
            }

            this.listenTo(buttonView, 'execute', () => editor.execute(LINK_EMBED_COMMAND));
            return buttonView;
        });
    }
}

// ---------------------------------------------------------------------------
// Schema + converters for linkEmbed (block) and linkMention (inline)
// ---------------------------------------------------------------------------

class LinkEmbedEditing extends Plugin {
    static get requires() {
        return [Widget];
    }

    init() {
        this._defineSchema();
        this._defineConverters();
        this.editor.commands.add(LINK_EMBED_COMMAND, new InsertLinkEmbedCommand(this.editor));
    }

    _defineSchema() {
        const schema = this.editor.model.schema;

        schema.register('linkEmbed', {
            isObject: true,
            allowAttributes: ['url', 'embedType'],
            allowWhere: '$block'
        });

        schema.register('linkMention', {
            isInline: true,
            isObject: true,
            allowAttributes: ['url'],
            allowWhere: '$text'
        });
    }

    _defineConverters() {
        const editor = this.editor;
        const conversion = editor.conversion;

        // ===== linkEmbed (block) =====

        conversion.for('upcast').elementToElement({
            model: (viewElement, { writer }) => {
                return writer.createElement('linkEmbed', {
                    url: viewElement.getAttribute('data-url'),
                    embedType: viewElement.getAttribute('data-embed-type')
                });
            },
            view: { name: 'section', classes: 'link-embed' }
        });

        conversion.for('dataDowncast').elementToElement({
            model: 'linkEmbed',
            view: (modelElement, { writer }) => {
                return writer.createContainerElement('section', {
                    class: 'link-embed',
                    'data-url': modelElement.getAttribute('url'),
                    'data-embed-type': modelElement.getAttribute('embedType')
                });
            }
        });

        conversion.for('editingDowncast').elementToElement({
            model: 'linkEmbed',
            view: (modelElement, { writer }) => {
                const url = modelElement.getAttribute('url') as string;
                const embedType = modelElement.getAttribute('embedType') as string;

                const section = writer.createContainerElement('section', {
                    class: 'link-embed',
                    'data-url': url,
                    'data-embed-type': embedType
                });

                const preview = writer.createUIElement('div', {
                    class: 'link-embed-preview-wrapper',
                    'data-cke-ignore-events': 'true'
                }, function (domDocument) {
                    const domElement = this.toDomElement(domDocument);
                    const editorEl = editor.editing.view.getDomRoot();
                    const component = glob.getComponentByEl<EditorComponent>(editorEl);
                    component.loadLinkEmbedPreview(url, embedType, $(domElement));
                    preventCKEditorHandling(domElement, editor);
                    return domElement;
                });

                writer.insert(writer.createPositionAt(section, 0), preview);
                return toWidget(section, writer, { label: 'link embed widget' });
            }
        });

        // ===== linkMention (inline) =====

        conversion.for('upcast').elementToElement({
            model: (viewElement, { writer }) => {
                return writer.createElement('linkMention', {
                    url: viewElement.getAttribute('data-url')
                });
            },
            view: { name: 'span', classes: 'link-mention' }
        });

        conversion.for('dataDowncast').elementToElement({
            model: 'linkMention',
            view: (modelElement, { writer }) => {
                return writer.createContainerElement('span', {
                    class: 'link-mention',
                    'data-url': modelElement.getAttribute('url')
                });
            }
        });

        conversion.for('editingDowncast').elementToElement({
            model: 'linkMention',
            view: (modelElement, { writer }) => {
                const url = modelElement.getAttribute('url') as string;

                const span = writer.createContainerElement('span', {
                    class: 'link-mention',
                    'data-url': url
                });

                const inner = writer.createUIElement('span', {
                    class: 'link-mention-inner',
                    'data-cke-ignore-events': 'true'
                }, function (domDocument) {
                    const domElement = this.toDomElement(domDocument);
                    const editorEl = editor.editing.view.getDomRoot();
                    const component = glob.getComponentByEl<EditorComponent>(editorEl);
                    component.loadLinkMentionPreview(url, $(domElement));
                    preventCKEditorHandling(domElement, editor);
                    return domElement;
                });

                writer.insert(writer.createPositionAt(span, 0), inner);
                return toWidget(span, writer, { label: 'link mention widget', hasSelectionHandle: false });
            }
        });
    }
}

class InsertLinkEmbedCommand extends Command {
    override execute() {
        const editorEl = this.editor.editing.view.getDomRoot();
        const component = glob.getComponentByEl(editorEl);
        component.triggerCommand('addLinkEmbedToText');
    }

    override refresh() {
        const model = this.editor.model;
        const selection = model.document.selection;
        const firstPosition = selection.getFirstPosition();
        const allowedIn = firstPosition && model.schema.findAllowedParent(firstPosition, 'linkEmbed');
        this.isEnabled = allowedIn !== null;
    }
}

// ---------------------------------------------------------------------------
// Paste handler: URL is pasted normally, then a popup offers conversion
// ---------------------------------------------------------------------------

interface PasteLocation {
    parentPath: number[];
    childOffset: number;
}

class LinkEmbedPasteHandler extends Plugin {
    private _popup: HTMLElement | null = null;
    private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
    private _clickOutside: ((e: MouseEvent) => void) | null = null;

    init() {
        const editor = this.editor;

        editor.model.document.on('change:data', () => {
            const changes = editor.model.document.differ.getChanges();
            if (changes.length === 0) return;

            for (const change of changes) {
                if (change.type !== 'insert' || change.name !== '$text') continue;

                const pos: Position = change.position;
                const parent = pos.parent;
                if (!parent || !parent.is('element')) continue;

                const textNode = parent.getChild(pos.offset);
                if (!textNode || !textNode.is('$text')) continue;

                const trimmed = textNode.data.trim();
                if (!isEmbeddableUrl(trimmed) || trimmed.includes('\n')) continue;

                const location: PasteLocation = {
                    parentPath: parent.getPath(),
                    childOffset: pos.offset
                };

                // Show popup after the current batch finishes and DOM stabilizes
                Promise.resolve().then(() => this._showPastePopup(trimmed, location));
                return;
            }
        });
    }

    private _showPastePopup(url: string, location: PasteLocation) {
        this._removePopup();

        const rect = this._getCaretRect();
        if (!rect) return;

        const MODES = [
            { mode: 'mention', icon: '@', label: 'Mention' },
            { mode: 'url', icon: '\u{1F517}', label: 'URL' },
            { mode: 'embed', icon: '\u25B6', label: 'Embed' }
        ] as const;

        const popup = document.createElement('div');
        popup.className = 'link-paste-popup';

        const header = document.createElement('div');
        header.className = 'link-paste-popup-header';
        header.textContent = 'Convert to';
        popup.appendChild(header);

        for (const { mode, icon, label } of MODES) {
            const btn = document.createElement('button');
            btn.className = 'link-paste-option';
            btn.dataset.mode = mode;
            btn.innerHTML = `<span class="link-paste-option-icon">${icon}</span><span class="link-paste-option-label">${label}</span>`;
            popup.appendChild(btn);
        }

        popup.style.position = 'fixed';
        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.bottom + 6}px`;
        popup.style.zIndex = '10000';
        document.body.appendChild(popup);

        let activeIndex = 0;
        const options = popup.querySelectorAll<HTMLElement>('.link-paste-option');
        options[0].classList.add('link-paste-option-active');

        requestAnimationFrame(() => popup.classList.add('link-paste-popup-visible'));

        const setActive = (index: number) => {
            options[activeIndex].classList.remove('link-paste-option-active');
            activeIndex = ((index % options.length) + options.length) % options.length;
            options[activeIndex].classList.add('link-paste-option-active');
        };

        for (let i = 0; i < options.length; i++) {
            options[i].addEventListener('mouseenter', () => setActive(i));
        }

        const confirm = () => {
            const mode = options[activeIndex].dataset.mode as typeof MODES[number]['mode'];
            this._removePopup();
            if (mode !== 'url') {
                this._convertPastedUrl(url, mode, location);
            }
        };

        popup.addEventListener('click', (e: Event) => {
            if ((e.target as HTMLElement).closest('.link-paste-option')) confirm();
        });

        const keyHandler = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    e.stopPropagation();
                    setActive(activeIndex + 1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    e.stopPropagation();
                    setActive(activeIndex - 1);
                    break;
                case 'Enter':
                    e.preventDefault();
                    e.stopPropagation();
                    confirm();
                    break;
                case 'Escape':
                    e.preventDefault();
                    e.stopPropagation();
                    this._removePopup();
                    break;
            }
        };

        const clickOutside = (e: MouseEvent) => {
            if (!popup.contains(e.target as Node)) {
                this._removePopup();
            }
        };

        setTimeout(() => {
            document.addEventListener('keydown', keyHandler, true);
            document.addEventListener('mousedown', clickOutside);
        }, 0);

        this._popup = popup;
        this._keyHandler = keyHandler;
        this._clickOutside = clickOutside;
    }

    /** Measures caret position via a temporary zero-width marker. */
    private _getCaretRect(): DOMRect | null {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const range = sel.getRangeAt(0).cloneRange();
            range.collapse(false);

            const marker = document.createElement('span');
            marker.textContent = '\u200B';
            range.insertNode(marker);

            const rect = marker.getBoundingClientRect();
            const result = new DOMRect(rect.left, rect.top, rect.width, rect.height);

            marker.remove();
            sel.removeAllRanges();
            sel.addRange(range);

            if (result.top > 0 || result.left > 0) return result;
        }

        const editorEl = this.editor.editing.view.getDomRoot();
        if (editorEl) {
            const elRect = editorEl.getBoundingClientRect();
            return new DOMRect(elRect.left + 16, elRect.top + 16, 0, 20);
        }

        return null;
    }

    private _removePopup() {
        if (this._popup) {
            this._popup.remove();
            this._popup = null;
        }
        if (this._keyHandler) {
            document.removeEventListener('keydown', this._keyHandler, true);
            this._keyHandler = null;
        }
        if (this._clickOutside) {
            document.removeEventListener('mousedown', this._clickOutside);
            this._clickOutside = null;
        }
    }

    /**
     * Replaces the pasted URL at the captured position with the chosen format.
     * Searches only within the specific parent element and picks the match
     * closest to the recorded child offset.
     */
    private _convertPastedUrl(url: string, mode: 'mention' | 'embed', location: PasteLocation) {
        const editor = this.editor;

        editor.model.change((writer) => {
            const root = editor.model.document.getRoot();
            if (!root) return;

            // Resolve the parent element from the captured path
            let parentEl = root as ReturnType<typeof root.getChild>;
            for (const idx of location.parentPath) {
                if (!parentEl || typeof (parentEl as any).getChild !== 'function') return;
                parentEl = (parentEl as any).getChild(idx);
            }
            if (!parentEl || !parentEl.is('element')) return;

            // Find the URL text closest to the recorded offset
            const parentRange = writer.createRangeIn(parentEl);
            let bestStart: Position | null = null;
            let bestEnd: Position | null = null;
            let bestDistance = Infinity;

            for (const item of parentRange.getWalker()) {
                if (!item.item.is('$textProxy')) continue;

                const text = item.item.data;
                const idx = text.indexOf(url);
                if (idx === -1) continue;

                const startOff = item.item.startOffset! + idx;
                const distance = Math.abs(startOff - location.childOffset);

                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestStart = writer.createPositionAt(parentEl, startOff);
                    bestEnd = writer.createPositionAt(parentEl, startOff + url.length);
                }
            }

            if (!bestStart || !bestEnd) return;

            const urlRange = writer.createRange(bestStart, bestEnd);
            writer.setSelection(urlRange);
            editor.model.deleteContent(editor.model.document.selection);

            if (mode === 'mention') {
                editor.model.insertContent(writer.createElement('linkMention', { url }));
            } else {
                const embedType = YOUTUBE_URL_REGEX.test(url) ? 'youtube' : 'opengraph';
                editor.model.insertContent(writer.createElement('linkEmbed', { url, embedType }));
            }
        });
    }

    override destroy() {
        this._removePopup();
        super.destroy();
    }
}
