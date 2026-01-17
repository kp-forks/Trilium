import "./SqlConsole.css";

import { SqlExecuteResults } from "@triliumnext/commons";
import { useState } from "preact/hooks";
import { ResizeColumnsModule, SortModule } from "tabulator-tables";

import { t } from "../../services/i18n";
import Tabulator from "../collections/table/tabulator";
import Alert from "../react/Alert";
import { useTriliumEvent } from "../react/hooks";
import SplitEditor from "./helpers/SplitEditor";
import { TypeWidgetProps } from "./type_widget";

export default function SqlConsole(props: TypeWidgetProps) {
    return (
        <SplitEditor
            noteType="code"
            {...props}
            previewContent={<SqlResults {...props} />}
        />
    );
}

function SqlResults({ note, ntxId }: TypeWidgetProps) {
    const [ results, setResults ] = useState<SqlExecuteResults>();

    useTriliumEvent("sqlQueryResults", ({ ntxId: eventNtxId, results }) => {
        if (eventNtxId !== ntxId) return;
        setResults(results);
    });

    const isEnabled = note?.mime === "text/x-sqlite;schema=trilium";
    return (
        <div className={`sql-result-widget ${!isEnabled ? "hidden-ext" : ""}`}>
            {isEnabled && (
                results?.length === 1 && Array.isArray(results[0]) && results[0].length === 0 ? (
                    <Alert type="info">
                        {t("sql_result.no_rows")}
                    </Alert>
                ) : (
                    <div className="sql-console-result-container selectable-text">
                        {results?.map(rows => {
                            // inserts, updates
                            if (typeof rows === "object" && !Array.isArray(rows)) {
                                return <pre>{JSON.stringify(rows, null, "\t")}</pre>;
                            }

                            // selects
                            return <SqlResultTable rows={rows} />;
                        })}
                    </div>
                )
            )}
        </div>
    );
}

function SqlResultTable({ rows }: { rows: object[] }) {
    if (!rows.length) return;

    return (
        <Tabulator
            layout="fitDataFill"
            modules={[ ResizeColumnsModule, SortModule ]}
            columns={[
                ...Object.keys(rows[0]).map(key => ({
                    title: key,
                    field: key,
                    width: 250,
                    minWidth: 100,
                    widthGrow: 1,
                    resizable: true
                }))
            ]}
            data={rows}
        />
    );
}
