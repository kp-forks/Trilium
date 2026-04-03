import * as officeParser from 'officeparser';

import log from '../../log.js';
import { OCRProcessingOptions, OCRResult } from '../ocr_service.js';
import { FileProcessor } from './file_processor.js';

// officeparser depends on pdfjs-dist which expects DOMMatrix at the
// top level. Provide a minimal stub so it doesn't crash in Node.js
// environments that lack it (e.g. Alpine Linux).
if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = class DOMMatrix {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    } as unknown as typeof globalThis.DOMMatrix;
}

const SUPPORTED_TYPES = [
    // Office Open XML
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',   // DOCX
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',         // XLSX
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
    // OpenDocument
    'application/vnd.oasis.opendocument.text',                                  // ODT
    'application/vnd.oasis.opendocument.spreadsheet',                            // ODS
    'application/vnd.oasis.opendocument.presentation'                            // ODP
];

/**
 * Office document processor for extracting text from DOCX/XLSX/PPTX and ODT/ODS/ODP files.
 */
export class OfficeProcessor extends FileProcessor {

    canProcess(mimeType: string): boolean {
        return SUPPORTED_TYPES.includes(mimeType);
    }

    getSupportedMimeTypes(): string[] {
        return [...SUPPORTED_TYPES];
    }

    async extractText(buffer: Buffer, options: OCRProcessingOptions = {}): Promise<OCRResult> {
        log.info('Starting Office document text extraction...');

        const text = await officeParser.parseOfficeAsync(buffer, {
            outputErrorToConsole: false,
            newlineDelimiter: '\n',
            ignoreNotes: false,
            putNotesAtLast: false
        });

        const trimmed = (text || '').trim();

        return {
            text: trimmed,
            confidence: trimmed.length > 0 ? 0.99 : 0,
            extractedAt: new Date().toISOString(),
            language: options.language || "eng",
            pageCount: 1
        };
    }

    getProcessingType(): string {
        return 'office';
    }

}
