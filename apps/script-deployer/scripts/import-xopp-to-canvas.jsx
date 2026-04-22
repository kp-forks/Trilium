import { useState, useCallback, useRef } from "trilium:preact";
import { runOnBackend, showMessage, showError, activateNote } from "trilium:api";

// Xournal++ named colors → hex
const XOPP_COLORS = {
    black: "#000000",
    blue: "#3333cc",
    red: "#ff0000",
    green: "#008000",
    gray: "#808080",
    lightblue: "#00c0ff",
    lightgreen: "#00ff00",
    magenta: "#ff00ff",
    orange: "#ff8000",
    yellow: "#ffff00",
    white: "#ffffff",
};

function convertColor(color) {
    if (!color) return "#000000";
    const lower = color.toLowerCase();
    if (XOPP_COLORS[lower]) return XOPP_COLORS[lower];
    // #RRGGBBAA or #RRGGBB
    if (lower.startsWith("#")) {
        return lower.length > 7 ? lower.slice(0, 7) : lower;
    }
    return "#000000";
}

function extractOpacity(color) {
    if (!color) return 100;
    if (color.startsWith("#") && color.length === 9) {
        const alpha = parseInt(color.slice(7, 9), 16);
        return Math.round((alpha / 255) * 100);
    }
    return 100;
}

function generateId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let id = "";
    for (let i = 0; i < 20; i++) {
        id += chars[Math.floor(Math.random() * chars.length)];
    }
    return id;
}

function makeBaseElement(type, x, y, width, height) {
    return {
        id: generateId(),
        type,
        x,
        y,
        width,
        height,
        angle: 0,
        strokeColor: "#000000",
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeWidth: 2,
        strokeStyle: "solid",
        roughness: 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        index: null,
        roundness: null,
        seed: Math.floor(Math.random() * 2000000000),
        version: 1,
        versionNonce: Math.floor(Math.random() * 2000000000),
        isDeleted: false,
        boundElements: null,
        updated: Date.now(),
        link: null,
        locked: false,
    };
}

function convertStroke(strokeEl, yOffset) {
    const coordText = strokeEl.textContent.trim();
    const coords = coordText.split(/\s+/).map(Number);
    if (coords.length < 4) return null;

    const originX = coords[0];
    const originY = coords[1] + yOffset;
    const points = [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (let i = 0; i < coords.length; i += 2) {
        const px = coords[i] - originX;
        const py = (coords[i + 1] + yOffset) - originY;
        points.push([px, py]);
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
    }

    const widthAttr = strokeEl.getAttribute("width") || "2";
    const widths = widthAttr.trim().split(/\s+/).map(Number);
    const hasPressure = widths.length > 1;

    // Normalize pressures to 0-1 range
    let pressures = [];
    if (hasPressure) {
        const maxW = Math.max(...widths);
        pressures = widths.map((w) => maxW > 0 ? w / maxW : 0.5);
        // Pad or trim to match point count
        while (pressures.length < points.length) {
            pressures.push(pressures[pressures.length - 1] || 0.5);
        }
        pressures = pressures.slice(0, points.length);
    }

    const color = strokeEl.getAttribute("color") || "black";
    const tool = strokeEl.getAttribute("tool") || "pen";

    // Highlighter strokes should be semi-transparent
    const isHighlighter = tool === "highlighter";

    const el = makeBaseElement(
        "freedraw",
        originX,
        originY,
        maxX - minX,
        maxY - minY
    );
    el.points = points;
    el.pressures = hasPressure ? pressures : [];
    el.simulatePressure = !hasPressure;
    el.strokeColor = convertColor(color);
    el.strokeWidth = widths[0] || 2;
    el.opacity = isHighlighter ? 40 : extractOpacity(color);
    el.lastCommittedPoint = points[points.length - 1] || null;

    return el;
}

function convertText(textEl, yOffset) {
    const x = parseFloat(textEl.getAttribute("x")) || 0;
    const y = (parseFloat(textEl.getAttribute("y")) || 0) + yOffset;
    const size = parseFloat(textEl.getAttribute("size")) || 12;
    const color = textEl.getAttribute("color") || "black";
    const content = textEl.textContent.trim();

    if (!content) return null;

    // Rough estimate of text dimensions
    const lines = content.split("\n");
    const estWidth = Math.max(...lines.map((l) => l.length)) * size * 0.6;
    const estHeight = lines.length * size * 1.3;

    const el = makeBaseElement("text", x, y, estWidth, estHeight);
    el.text = content;
    el.fontSize = size;
    el.fontFamily = 5; // Excalidraw "Normal" font (Nunito)
    el.textAlign = "left";
    el.verticalAlign = "top";
    el.strokeColor = convertColor(color);
    el.opacity = extractOpacity(color);
    el.containerId = null;
    el.originalText = content;
    el.autoResize = true;
    el.lineHeight = 1.25;

    return el;
}

function convertImage(imageEl, yOffset, files) {
    const leftAttr = imageEl.getAttribute("left");
    const topAttr = imageEl.getAttribute("top");
    const rightAttr = imageEl.getAttribute("right");
    const bottomAttr = imageEl.getAttribute("bottom");

    if (!leftAttr || !topAttr || !rightAttr || !bottomAttr) return null;

    const left = parseFloat(leftAttr);
    const top = parseFloat(topAttr) + yOffset;
    const right = parseFloat(rightAttr);
    const bottom = parseFloat(bottomAttr) + yOffset;

    const imgData = imageEl.textContent.trim();
    if (!imgData) return null;

    const fileId = generateId();
    files[fileId] = {
        mimeType: "image/png",
        id: fileId,
        dataURL: `data:image/png;base64,${imgData}`,
        created: Date.now(),
        lastRetrieved: Date.now(),
    };

    const el = makeBaseElement("image", left, top, right - left, bottom - top);
    el.fileId = fileId;
    el.status = "saved";
    el.scale = [1, 1];

    return el;
}

async function gunzip(buffer) {
    const ds = new DecompressionStream("gzip");
    const stream = new Blob([buffer]).stream().pipeThrough(ds);
    return await new Response(stream).text();
}

async function convertXopp(buffer) {
    const xmlString = await gunzip(buffer);
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "text/xml");

    const parserError = doc.querySelector("parsererror");
    if (parserError) {
        throw new Error("Failed to parse .xopp XML: " + parserError.textContent);
    }

    const pages = doc.querySelectorAll("page");
    const elements = [];
    const files = {};
    let yOffset = 0;
    const PAGE_GAP = 80;

    for (const page of pages) {
        const pageHeight = parseFloat(page.getAttribute("height")) || 792;

        // Draw a subtle page boundary rectangle
        const pageWidth = parseFloat(page.getAttribute("width")) || 612;
        const bgRect = makeBaseElement("rectangle", 0, yOffset, pageWidth, pageHeight);
        bgRect.strokeColor = "#d0d0d0";
        bgRect.strokeWidth = 1;
        bgRect.strokeStyle = "dashed";
        bgRect.backgroundColor = "transparent";
        bgRect.opacity = 50;
        elements.push(bgRect);

        const layers = page.querySelectorAll("layer");
        for (const layer of layers) {
            for (const child of layer.children) {
                const tag = child.tagName.toLowerCase();
                let el = null;

                if (tag === "stroke") {
                    el = convertStroke(child, yOffset);
                } else if (tag === "text") {
                    el = convertText(child, yOffset);
                } else if (tag === "image") {
                    el = convertImage(child, yOffset, files);
                }

                if (el) elements.push(el);
            }
        }

        yOffset += pageHeight + PAGE_GAP;
    }

    return {
        type: "excalidraw",
        version: 2,
        elements,
        files,
        appState: {
            gridModeEnabled: false,
            viewBackgroundColor: "#ffffff",
        },
    };
}

export default function XoppImporter() {
    const [status, setStatus] = useState("idle"); // idle | converting | done | error
    const [message, setMessage] = useState("");
    const [stats, setStats] = useState(null);
    const fileInputRef = useRef(null);

    const handleFile = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith(".xopp")) {
            showError("Please select a .xopp file");
            return;
        }

        setStatus("converting");
        setMessage(`Converting ${file.name}...`);

        try {
            const buffer = await file.arrayBuffer();
            const excalidrawData = await convertXopp(buffer);

            const elementCount = excalidrawData.elements.length;
            const fileCount = Object.keys(excalidrawData.files).length;
            const title = file.name.replace(/\.xopp$/, "");

            // Create the canvas note on the backend
            const noteId = await runOnBackend(
                (title, content) => {
                    const { note } = api.createNewNote({
                        parentNoteId: "root",
                        title: title,
                        content: content,
                        type: "canvas",
                        mime: "application/json",
                    });
                    return note.noteId;
                },
                [title, JSON.stringify(excalidrawData)]
            );

            setStatus("done");
            setStats({ elementCount, fileCount, title });
            setMessage(`Created canvas note "${title}"`);
            showMessage(`Imported ${file.name} as canvas note`);

            // Navigate to the new note
            if (noteId) {
                activateNote(noteId);
            }
        } catch (err) {
            setStatus("error");
            setMessage(`Error: ${err.message}`);
            showError(`Failed to convert: ${err.message}`);
        }

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }, []);

    return (
        <div style={{ padding: "20px", maxWidth: "600px" }}>
            <h2 style={{ marginTop: 0 }}>Xournal++ Importer</h2>
            <p style={{ color: "#666" }}>
                Convert <code>.xopp</code> files to Excalidraw canvas notes.
                Multi-page documents are stacked vertically.
            </p>

            <div
                style={{
                    border: "2px dashed #aaa",
                    borderRadius: "8px",
                    padding: "30px",
                    textAlign: "center",
                    marginBottom: "16px",
                    backgroundColor: status === "converting" ? "#fff8e1" : "#fafafa",
                }}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xopp"
                    onChange={handleFile}
                    disabled={status === "converting"}
                    style={{ fontSize: "14px" }}
                />
                <p style={{ margin: "10px 0 0", fontSize: "13px", color: "#888" }}>
                    Select a .xopp file from Xournal++
                </p>
            </div>

            {status === "converting" && (
                <div style={{ color: "#f57f17", fontWeight: "bold" }}>
                    {message}
                </div>
            )}

            {status === "done" && stats && (
                <div
                    style={{
                        backgroundColor: "#e8f5e9",
                        padding: "12px",
                        borderRadius: "6px",
                    }}
                >
                    <strong>Done!</strong> {message}
                    <br />
                    <span style={{ fontSize: "13px", color: "#555" }}>
                        {stats.elementCount} elements
                        {stats.fileCount > 0 ? `, ${stats.fileCount} embedded images` : ""}
                    </span>
                </div>
            )}

            {status === "error" && (
                <div
                    style={{
                        backgroundColor: "#ffebee",
                        padding: "12px",
                        borderRadius: "6px",
                        color: "#c62828",
                    }}
                >
                    {message}
                </div>
            )}
        </div>
    );
}
