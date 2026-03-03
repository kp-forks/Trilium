import "@univerjs/preset-sheets-core/lib/index.css";
import "./Spreadsheet.css";

import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverPresetSheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import { createUniver, FUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { MutableRef, useEffect, useRef } from "preact/hooks";

import { useColorScheme } from "../react/hooks";

export default function Spreadsheet() {
    const containerRef = useRef<HTMLDivElement>(null);
    const apiRef = useRef<FUniver>();

    useInitializeSpreadsheet(containerRef, apiRef);
    useDarkMode(apiRef);

    return <div ref={containerRef} className="spreadsheet" />;
}

function useInitializeSpreadsheet(containerRef: MutableRef<HTMLDivElement | null>, apiRef: MutableRef<FUniver | undefined>) {
    useEffect(() => {
        if (!containerRef.current) return;

        const { univerAPI } = createUniver({
            locale: LocaleType.EN_US,
            locales: {
                [LocaleType.EN_US]: mergeLocales(
                    UniverPresetSheetsCoreEnUS
                ),
            },
            presets: [
                UniverSheetsCorePreset({
                    container: containerRef.current,
                })
            ]
        });
        apiRef.current = univerAPI;
        univerAPI.createWorkbook({});
        return () => univerAPI.dispose();
    }, [ apiRef, containerRef ]);
}

function useDarkMode(apiRef: MutableRef<FUniver | undefined>) {
    const colorScheme = useColorScheme();

    // React to dark mode.
    useEffect(() => {
        const univerAPI = apiRef.current;
        if (!univerAPI) return;
        univerAPI.toggleDarkMode(colorScheme === 'dark');
    }, [ colorScheme, apiRef ]);
}
