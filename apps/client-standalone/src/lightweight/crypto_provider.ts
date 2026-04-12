import type { Cipher, CryptoProvider, ScryptOptions } from "@triliumnext/core";
import { binary_utils } from "@triliumnext/core";
import { sha1 } from "js-sha1";
import { sha256 } from "js-sha256";
import { sha512 } from "js-sha512";
import { md5 } from "js-md5";
import { scrypt } from "scrypt-js";

const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Crypto provider for browser environments using the Web Crypto API.
 */
export default class BrowserCryptoProvider implements CryptoProvider {

    createHash(algorithm: "md5" | "sha1" | "sha512", content: string | Uint8Array): Uint8Array {
        const data = binary_utils.unwrapStringOrBuffer(content);

        let hexHash: string;
        if (algorithm === "md5") {
            hexHash = md5(data);
        } else if (algorithm === "sha1") {
            hexHash = sha1(data);
        } else {
            hexHash = sha512(data);
        }

        // Convert hex string to Uint8Array
        const bytes = new Uint8Array(hexHash.length / 2);
        for (let i = 0; i < hexHash.length; i += 2) {
            bytes[i / 2] = parseInt(hexHash.substr(i, 2), 16);
        }
        return bytes;
    }

    createCipheriv(algorithm: "aes-128-cbc", key: Uint8Array, iv: Uint8Array): Cipher {
        // Web Crypto API doesn't support streaming cipher like Node.js
        // We need to implement a wrapper that collects data and encrypts on final()
        return new WebCryptoCipher(algorithm, key, iv, "encrypt");
    }

    createDecipheriv(algorithm: "aes-128-cbc", key: Uint8Array, iv: Uint8Array): Cipher {
        return new WebCryptoCipher(algorithm, key, iv, "decrypt");
    }

    randomBytes(size: number): Uint8Array {
        const bytes = new Uint8Array(size);
        crypto.getRandomValues(bytes);
        return bytes;
    }

    randomString(length: number): string {
        const bytes = this.randomBytes(length);
        let result = "";
        for (let i = 0; i < length; i++) {
            result += CHARS[bytes[i] % CHARS.length];
        }
        return result;
    }

    hmac(secret: string | Uint8Array, value: string | Uint8Array): string {
        const secretStr = binary_utils.unwrapStringOrBuffer(secret);
        const valueStr = binary_utils.unwrapStringOrBuffer(value);
        // sha256.hmac returns hex, convert to base64 to match Node's behavior
        const hexHash = sha256.hmac(secretStr, valueStr);
        const bytes = new Uint8Array(hexHash.length / 2);
        for (let i = 0; i < hexHash.length; i += 2) {
            bytes[i / 2] = parseInt(hexHash.substr(i, 2), 16);
        }
        return btoa(String.fromCharCode(...bytes));
    }

    async scrypt(
        password: Uint8Array | string,
        salt: Uint8Array | string,
        keyLength: number,
        options: ScryptOptions = {}
    ): Promise<Uint8Array> {
        const { N = 16384, r = 8, p = 1 } = options;
        const passwordBytes = binary_utils.wrapStringOrBuffer(password);
        const saltBytes = binary_utils.wrapStringOrBuffer(salt);

        return scrypt(passwordBytes, saltBytes, N, r, p, keyLength);
    }

    constantTimeCompare(a: Uint8Array, b: Uint8Array): boolean {
        if (a.length !== b.length) {
            // Maintain constant time by comparing a to itself
            let dummy = 0;
            for (let i = 0; i < a.length; i++) {
                dummy |= a[i] ^ a[i];
            }
            return false;
        }

        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a[i] ^ b[i];
        }
        return result === 0;
    }
}

/**
 * A cipher implementation that wraps Web Crypto API.
 * Note: This buffers all data until final() is called, which differs from
 * Node.js's streaming cipher behavior.
 */
class WebCryptoCipher implements Cipher {
    private chunks: Uint8Array[] = [];
    private algorithm: string;
    private key: Uint8Array;
    private iv: Uint8Array;
    private mode: "encrypt" | "decrypt";
    private finalized = false;

    constructor(
        algorithm: "aes-128-cbc",
        key: Uint8Array,
        iv: Uint8Array,
        mode: "encrypt" | "decrypt"
    ) {
        this.algorithm = algorithm;
        this.key = key;
        this.iv = iv;
        this.mode = mode;
    }

    update(data: Uint8Array): Uint8Array {
        if (this.finalized) {
            throw new Error("Cipher has already been finalized");
        }
        // Buffer the data - Web Crypto doesn't support streaming
        this.chunks.push(data);
        // Return empty array since we process everything in final()
        return new Uint8Array(0);
    }

    final(): Uint8Array {
        if (this.finalized) {
            throw new Error("Cipher has already been finalized");
        }
        this.finalized = true;

        // Web Crypto API is async, but we need sync behavior
        // This is a fundamental limitation that requires architectural changes
        // For now, throw an error directing users to use async methods
        throw new Error(
            "Synchronous cipher finalization not available in browser. " +
            "The Web Crypto API is async-only. Use finalizeAsync() instead."
        );
    }

    /**
     * Async version that actually performs the encryption/decryption.
     */
    async finalizeAsync(): Promise<Uint8Array> {
        if (this.finalized) {
            throw new Error("Cipher has already been finalized");
        }
        this.finalized = true;

        // Concatenate all chunks
        const totalLength = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const data = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of this.chunks) {
            data.set(chunk, offset);
            offset += chunk.length;
        }

        // Copy key and iv to ensure they're plain ArrayBuffer-backed
        const keyBuffer = new Uint8Array(this.key);
        const ivBuffer = new Uint8Array(this.iv);

        // Import the key
        const cryptoKey = await crypto.subtle.importKey(
            "raw",
            keyBuffer,
            { name: "AES-CBC" },
            false,
            [this.mode]
        );

        // Perform encryption/decryption
        const result = this.mode === "encrypt"
            ? await crypto.subtle.encrypt({ name: "AES-CBC", iv: ivBuffer }, cryptoKey, data)
            : await crypto.subtle.decrypt({ name: "AES-CBC", iv: ivBuffer }, cryptoKey, data);

        return new Uint8Array(result);
    }
}
