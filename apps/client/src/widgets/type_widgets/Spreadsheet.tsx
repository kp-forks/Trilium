import "@univerjs/preset-sheets-core/lib/index.css";
import "./Spreadsheet.css";

import { UniverSheetsCorePreset } from '@univerjs/preset-sheets-core';
import UniverPresetSheetsCoreEnUS from '@univerjs/preset-sheets-core/locales/en-US';
import { createUniver, FUniver, LocaleType, mergeLocales } from '@univerjs/presets';
import { useEffect, useRef } from "preact/hooks";

import { useColorScheme } from "../react/hooks";

export default function Spreadsheet() {
    const colorScheme = useColorScheme();

    return (
        <UniverSpreadsheet darkMode={colorScheme === 'dark'} />
    );
}

function UniverSpreadsheet({ darkMode }: { darkMode: boolean }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const apiRef = useRef<FUniver>();

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
    }, []);

    // React to dark mode.
    useEffect(() => {
        const univerAPI = apiRef.current;
        if (!univerAPI) return;
        univerAPI.toggleDarkMode(darkMode);
    }, [ darkMode ]);

    return <div ref={containerRef} className="spreadsheet" />;
}
