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
const ODT = 'application/vnd.oasis.opendocument.text';

const SAMPLES_DIR = join(__dirname, 'samples');

// Phrases that span the whole sample document (heading, body, URL, code block,
// ordered/unordered lists, block quote). Asserting on these proves the parser
// walked the entire structure, not just the first paragraph.
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
    it('extracts the full text of a DOCX document', async () => {
        const processor = new OfficeProcessor();

        const result = await processor.extractText(readSample('demo.docx'), {
            mimeType: DOCX,
            language: 'deu'
        });

        for (const phrase of EXPECTED_PHRASES) {
            expect(result.text).toContain(phrase);
        }
        // Multi-paragraph output joined by the configured newline delimiter.
        expect(result.text.split('\n').length).toBeGreaterThan(5);
        expect(result.confidence).toBe(0.99);
        expect(result.pageCount).toBe(1);
        expect(result.language).toBe('deu');
    });

    it('extracts the full text of an ODT document and defaults the language', async () => {
        const processor = new OfficeProcessor();

        const result = await processor.extractText(readSample('demo.odt'), { mimeType: ODT });

        for (const phrase of EXPECTED_PHRASES) {
            expect(result.text).toContain(phrase);
        }
        expect(result.confidence).toBe(0.99);
        expect(result.pageCount).toBe(1);
        expect(result.language).toBe('eng');
    });

    it('produces the same extracted text regardless of the source format', async () => {
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
