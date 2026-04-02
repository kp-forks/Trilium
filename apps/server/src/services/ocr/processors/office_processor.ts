import * as officeParser from 'officeparser';

import log from '../../log.js';
import { OCRProcessingOptions,OCRResult } from '../ocr_service.js';
import { FileProcessor } from './file_processor.js';
import { ImageProcessor } from './image_processor.js';

/**
 * Office document processor for extracting text and images from DOCX/XLSX/PPTX files
 */
export class OfficeProcessor extends FileProcessor {
    private imageProcessor: ImageProcessor;
    private readonly supportedTypes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
        'application/msword', // DOC
        'application/vnd.ms-excel', // XLS
        'application/vnd.ms-powerpoint', // PPT
        'application/rtf' // RTF
    ];

    constructor() {
        super();
        this.imageProcessor = new ImageProcessor();
    }

    canProcess(mimeType: string): boolean {
        return this.supportedTypes.includes(mimeType);
    }

    getSupportedMimeTypes(): string[] {
        return [...this.supportedTypes];
    }

    async extractText(buffer: Buffer, options: OCRProcessingOptions = {}): Promise<OCRResult> {
        try {
            log.info('Starting Office document text extraction...');

            const language = options.language || "eng";

            // Extract text from Office document
            const data = await this.parseOfficeDocument(buffer);

            // Extract text from Office document
            const combinedText = data.data && data.data.trim().length > 0 ? data.data.trim() : '';
            const confidence = combinedText.length > 0 ? 0.99 : 0; // High confidence for direct text extraction

            const result: OCRResult = {
                text: combinedText,
                confidence,
                extractedAt: new Date().toISOString(),
                language,
                pageCount: 1 // Office documents are treated as single logical document
            };

            log.info(`Office document text extraction completed. Confidence: ${confidence}%, Text length: ${result.text.length}`);
            return result;

        } catch (error) {
            log.error(`Office document text extraction failed: ${error}`);
            throw error;
        }
    }

    private async parseOfficeDocument(buffer: Buffer): Promise<{ data: string }> {
        try {
            // Use promise-based API directly
            const data = await officeParser.parseOfficeAsync(buffer, {
                outputErrorToConsole: false,
                newlineDelimiter: '\n',
                ignoreNotes: false,
                putNotesAtLast: false
            });

            return {
                data: data || ''
            };
        } catch (error) {
            throw new Error(`Office document parsing failed: ${error}`);
        }
    }

    getProcessingType(): string {
        return 'office';
    }

    async cleanup(): Promise<void> {
        await this.imageProcessor.cleanup();
    }
}
