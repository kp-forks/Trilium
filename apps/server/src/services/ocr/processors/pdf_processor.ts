import pdfParse from 'pdf-parse';

import log from '../../log.js';
import { OCRProcessingOptions, OCRResult } from '../ocr_service.js';
import { FileProcessor } from './file_processor.js';

/**
 * PDF processor for extracting embedded text from PDF files using pdf-parse.
 */
export class PDFProcessor extends FileProcessor {

    canProcess(mimeType: string): boolean {
        return mimeType.toLowerCase() === 'application/pdf';
    }

    getSupportedMimeTypes(): string[] {
        return ['application/pdf'];
    }

    async extractText(buffer: Buffer, options: OCRProcessingOptions = {}): Promise<OCRResult> {
        log.info('Starting PDF text extraction...');

        const data = await pdfParse(buffer);

        return {
            text: data.text.trim(),
            confidence: 0.99,
            extractedAt: new Date().toISOString(),
            language: options.language || "eng",
            pageCount: data.numpages
        };
    }

    getProcessingType(): string {
        return 'pdf';
    }

    async cleanup(): Promise<void> {
        // Nothing to clean up.
    }
}
