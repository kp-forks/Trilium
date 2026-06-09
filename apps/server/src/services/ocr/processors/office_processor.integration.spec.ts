import { readFileSync } from 'fs';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Unlike office_processor.spec.ts, this suite does NOT mock officeparser. It runs
// the real parser against committed sample documents to prove that OfficeProcessor
// actually extracts the embedded text for each supported format — catching upstream
// API/output changes that a mocked unit test cannot.

const mockLog = { info: vi.fn(), error: vi.fn() };

vi.mock('@triliumnext/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@triliumnext/core')>();
    return {
        ...actual,
        getLog: () => mockLog
    };
});

let OfficeProcessor: typeof import('./office_processor.js').OfficeProcessor;

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
const ODT = 'application/vnd.oasis.opendocument.text';
const ODP = 'application/vnd.oasis.opendocument.presentation';

const SAMPLES_DIR = join(__dirname, 'samples');

// Each sample exercises a distinct officeparser code path: DOCX -> WordParser,
// PPTX -> PowerPointParser, ODT/ODP -> OpenOfficeParser (text vs. presentation
// element handling), with OOXML vs. ODF magic-byte detection on top.
const SAMPLES = [
    { label: 'DOCX', file: 'demo.docx', mimeType: DOCX },
    { label: 'PPTX', file: 'demo.pptx', mimeType: PPTX },
    { label: 'ODT', file: 'demo.odt', mimeType: ODT },
    { label: 'ODP', file: 'demo.odp', mimeType: ODP }
];

// Phrases drawn from across the shared sample content (heading, body, URL, code
// block, ordered/unordered lists, block quote, closing line). Asserting on all of
// them proves the parser walked the whole document, not just the first paragraph.
const EXPECTED_PHRASES = [
    'Welcome to Trilium Notes!',
    'showcase some of its features',
    'https://github.com/TriliumNext',
    'void foo()',
    'First Item',
    'Second item',
    'Ludwig Wittgenstein',
    'Checkout also other examples like tables'
];

beforeEach(async () => {
    vi.clearAllMocks();
    ({ OfficeProcessor } = await import('./office_processor.js'));
});

describe('OfficeProcessor (integration — real officeparser)', () => {
    describe.each(SAMPLES)('$label', ({ file, mimeType }) => {
        it('extracts the embedded text with high confidence', async () => {
            const processor = new OfficeProcessor();

            const result = await processor.extractText(readSample(file), { mimeType });

            for (const phrase of EXPECTED_PHRASES) {
                expect(result.text).toContain(phrase);
            }
            // Multi-paragraph output joined by the configured newline delimiter.
            expect(result.text.split('\n').length).toBeGreaterThan(5);
            expect(result.confidence).toBe(0.99);
            expect(result.pageCount).toBe(1);
            // Language defaults to English when the caller does not specify one.
            expect(result.language).toBe('eng');
        });
    });

    it('passes the caller-supplied language through to the result', async () => {
        const processor = new OfficeProcessor();

        const result = await processor.extractText(readSample('demo.docx'), {
            mimeType: DOCX,
            language: 'deu'
        });

        expect(result.language).toBe('deu');
    });

    it('extracts identical text from the DOCX and ODT renditions of the same document', async () => {
        const processor = new OfficeProcessor();

        const docx = await processor.extractText(readSample('demo.docx'), { mimeType: DOCX });
        const odt = await processor.extractText(readSample('demo.odt'), { mimeType: ODT });

        expect(docx.text).toBe(odt.text);
        expect(docx.text.length).toBeGreaterThan(500);
    });
});

function readSample(fileName: string): Buffer {
    return readFileSync(join(SAMPLES_DIR, fileName));
}
