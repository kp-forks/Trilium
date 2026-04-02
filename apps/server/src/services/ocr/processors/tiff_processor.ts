import sharp from 'sharp';

import log from '../../log.js';
import { OCRProcessingOptions,OCRResult } from '../ocr_service.js';
import { FileProcessor } from './file_processor.js';
import { ImageProcessor } from './image_processor.js';

/**
 * TIFF processor for extracting text from multi-page TIFF files
 */
export class TIFFProcessor extends FileProcessor {
    private imageProcessor: ImageProcessor;
    private readonly supportedTypes = ['image/tiff', 'image/tif'];

    constructor() {
        super();
        this.imageProcessor = new ImageProcessor();
    }

    canProcess(mimeType: string): boolean {
        return mimeType.toLowerCase() === 'image/tiff' || mimeType.toLowerCase() === 'image/tif';
    }

    getSupportedMimeTypes(): string[] {
        return [...this.supportedTypes];
    }

    async extractText(buffer: Buffer, options: OCRProcessingOptions = {}): Promise<OCRResult> {
        try {
            log.info('Starting TIFF text extraction...');

            const language = options.language || "eng";

            // Check if this is a multi-page TIFF
            const metadata = await sharp(buffer).metadata();
            const pageCount = metadata.pages || 1;

            let combinedText = '';
            let totalConfidence = 0;

            // Process each page
            for (let page = 0; page < pageCount; page++) {
                try {
                    log.info(`Processing TIFF page ${page + 1}/${pageCount}...`);

                    // Extract page as PNG buffer
                    const pageBuffer = await sharp(buffer, { page })
                        .png()
                        .toBuffer();

                    // OCR the page
                    const pageResult = await this.imageProcessor.extractText(pageBuffer, options);

                    if (pageResult.text.trim().length > 0) {
                        if (combinedText.length > 0) {
                            combinedText += `\n\n--- Page ${page + 1} ---\n`;
                        }
                        combinedText += pageResult.text;
                        totalConfidence += pageResult.confidence;
                    }
                } catch (error) {
                    log.error(`Failed to process TIFF page ${page + 1}: ${error}`);
                    // Continue with other pages
                }
            }

            const averageConfidence = pageCount > 0 ? totalConfidence / pageCount : 0;

            const result: OCRResult = {
                text: combinedText.trim(),
                confidence: averageConfidence,
                extractedAt: new Date().toISOString(),
                language,
                pageCount
            };

            return result;

        } catch (error) {
            log.error(`TIFF text extraction failed: ${error}`);
            throw error;
        }
    }

    getProcessingType(): string {
        return 'tiff';
    }

    async cleanup(): Promise<void> {
        await this.imageProcessor.cleanup();
    }
}
