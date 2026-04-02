import pdfParse from 'pdf-parse';

import log from '../../log.js';
import { OCRProcessingOptions,OCRResult } from '../ocr_service.js';
import { FileProcessor } from './file_processor.js';
import { ImageProcessor } from './image_processor.js';

/**
 * PDF processor for extracting text from PDF files
 * First tries to extract existing text, then falls back to OCR on images
 */
export class PDFProcessor extends FileProcessor {
    private imageProcessor: ImageProcessor;
    private readonly supportedTypes = ['application/pdf'];

    constructor() {
        super();
        this.imageProcessor = new ImageProcessor();
    }

    canProcess(mimeType: string): boolean {
        return mimeType.toLowerCase() === 'application/pdf';
    }

    getSupportedMimeTypes(): string[] {
        return [...this.supportedTypes];
    }

    async extractText(buffer: Buffer, options: OCRProcessingOptions = {}): Promise<OCRResult> {
        try {
            log.info('Starting PDF text extraction...');

            // First try to extract existing text from PDF
            if (options.enablePDFTextExtraction !== false) {
                const textResult = await this.extractTextFromPDF(buffer, options);
                if (textResult.text.trim().length > 0) {
                    log.info(`PDF text extraction successful. Length: ${textResult.text.length}`);
                    return textResult;
                }
            }

            // Fall back to OCR if no text found or PDF text extraction is disabled
            log.info('No text found in PDF or text extraction disabled, falling back to OCR...');
            return await this.extractTextViaOCR(buffer, options);

        } catch (error) {
            log.error(`PDF text extraction failed: ${error}`);
            throw error;
        }
    }

    private async extractTextFromPDF(buffer: Buffer, options: OCRProcessingOptions): Promise<OCRResult> {
        try {
            const data = await pdfParse(buffer);

            return {
                text: data.text.trim(),
                confidence: 0.99, // High confidence for direct text extraction
                extractedAt: new Date().toISOString(),
                language: options.language || "eng",
                pageCount: data.numpages
            };
        } catch (error) {
            log.error(`PDF text extraction failed: ${error}`);
            throw error;
        }
    }

    private async extractTextViaOCR(buffer: Buffer, options: OCRProcessingOptions): Promise<OCRResult> {
        try {
            // Convert PDF to images and OCR each page
            // For now, we'll use a simple approach - convert first page to image
            // In a full implementation, we'd convert all pages

            // This is a simplified implementation
            // In practice, you might want to use pdf2pic or similar library
            // to convert PDF pages to images for OCR

            // For now, we'll return a placeholder result
            // indicating that OCR on PDF is not fully implemented
            log.info('PDF to image conversion not fully implemented, returning placeholder');

            return {
                text: '[PDF OCR not fully implemented - would convert PDF pages to images and OCR each page]',
                confidence: 0.0,
                extractedAt: new Date().toISOString(),
                language: options.language || "eng",
                pageCount: 1
            };
        } catch (error) {
            log.error(`PDF OCR extraction failed: ${error}`);
            throw error;
        }
    }

    getProcessingType(): string {
        return 'pdf';
    }

    async cleanup(): Promise<void> {
        await this.imageProcessor.cleanup();
    }
}
