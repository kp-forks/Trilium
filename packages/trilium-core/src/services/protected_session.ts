"use strict";

import dataEncryptionService from "./encryption/data_encryption";

let dataKey: Uint8Array | null = null;

function setDataKey(decryptedDataKey: Uint8Array) {
    dataKey = Uint8Array.from(decryptedDataKey);
}

function getDataKey() {
    return dataKey;
}

export function resetDataKey() {
    dataKey = null;
}

export function isProtectedSessionAvailable() {
    return !!dataKey;
}

function encrypt(plainText: string | Uint8Array) {
    const dataKey = getDataKey();
    if (plainText === null || dataKey === null) {
        return null;
    }

    return dataEncryptionService.encrypt(dataKey, plainText);
}

async function encryptAsync(plainText: string | Uint8Array): Promise<string | null> {
    const dataKey = getDataKey();
    if (plainText === null || dataKey === null) {
        return null;
    }

    return dataEncryptionService.encryptAsync(dataKey, plainText);
}

function decrypt(cipherText: string | Uint8Array): Uint8Array | null {
    const dataKey = getDataKey();
    if (cipherText === null || dataKey === null) {
        return null;
    }

    return dataEncryptionService.decrypt(dataKey, cipherText) || null;
}

async function decryptAsync(cipherText: string | Uint8Array): Promise<Uint8Array | null> {
    const dataKey = getDataKey();
    if (cipherText === null || dataKey === null) {
        return null;
    }

    return (await dataEncryptionService.decryptAsync(dataKey, cipherText)) || null;
}

function decryptString(cipherText: string): string | null {
    const dataKey = getDataKey();
    if (dataKey === null) {
        return null;
    }
    return dataEncryptionService.decryptString(dataKey, cipherText);
}

async function decryptStringAsync(cipherText: string): Promise<string | null> {
    const dataKey = getDataKey();
    if (dataKey === null) {
        return null;
    }
    return dataEncryptionService.decryptStringAsync(dataKey, cipherText);
}

let lastProtectedSessionOperationDate: number | null = null;

function touchProtectedSession() {
    if (isProtectedSessionAvailable()) {
        lastProtectedSessionOperationDate = Date.now();
    }
}

export function getLastProtectedSessionOperationDate() {
    return lastProtectedSessionOperationDate;
}

export default {
    setDataKey,
    resetDataKey,
    isProtectedSessionAvailable,
    encrypt,
    encryptAsync,
    decrypt,
    decryptAsync,
    decryptString,
    decryptStringAsync,
    touchProtectedSession,
    getLastProtectedSessionOperationDate
};
