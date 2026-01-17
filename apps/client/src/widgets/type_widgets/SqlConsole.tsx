import "./SqlConsole.css";

import { SchemaResponse, SqlExecuteResults } from "@triliumnext/commons";
import { useEffect, useState } from "preact/hooks";
import { ClipboardModule, EditModule, ExportModule, FilterModule, FormatModule, FrozenColumnsModule, KeybindingsModule, ResizeColumnsModule, SelectRangeModule, SelectRowModule, SortModule } from "tabulator-tables";

import { t } from "../../services/i18n";
import server from "../../services/server";
import Tabulator from "../collections/table/tabulator";
import Alert from "../react/Alert";
import Dropdown from "../react/Dropdown";
import { useTriliumEvent } from "../react/hooks";
import SplitEditor from "./helpers/SplitEditor";
import { TypeWidgetProps } from "./type_widget";

export default function SqlConsole(props: TypeWidgetProps) {
    return (
        <>
            <SplitEditor
                noteType="code"
                {...props}
                editorBefore={<SqlTableSchemas {...props} />}
                previewContent={<SqlResults {...props} />}
                splitOptions={{
                    sizes: [ 70, 30 ]
                }}
            />
        </>
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
            modules={[ ResizeColumnsModule, SortModule, SelectRangeModule, ClipboardModule, KeybindingsModule, EditModule, ExportModule, SelectRowModule, FormatModule, FrozenColumnsModule, FilterModule ]}
            selectableRange
            clipboard="copy"
            clipboardCopyRowRange="range"
            clipboardCopyConfig={{
                rowHeaders: false,
                columnHeaders: false
            }}
            columns={[
                {
                    title: "#",
                    formatter: "rownum",
                    width: 60,
                    hozAlign: "right",
                    frozen: true
                },
                ...Object.keys(rows[0]).map(key => ({
                    title: key,
                    field: key,
                    width: 250,
                    minWidth: 100,
                    widthGrow: 1,
                    resizable: true,
                    headerFilter: true
                }))
            ]}
            data={rows}
        />
    );
}

export function SqlTableSchemas({ note }: TypeWidgetProps) {
    const [ schemas, setSchemas ] = useState<SchemaResponse[]>();

    useEffect(() => {
        server.get<SchemaResponse[]>("sql/schema").then(setSchemas);
    }, []);

    const isEnabled = note?.mime === "text/x-sqlite;schema=trilium" && schemas;
    return (
        <div className={`sql-table-schemas-widget ${!isEnabled ? "hidden-ext" : ""}`}>
            {isEnabled && (
                <>
                    {t("sql_table_schemas.tables")}{": "}

                    <span class="sql-table-schemas">
                        {schemas.map(({ name, columns }) => (
                            <>
                                <Dropdown text={name} noSelectButtonStyle hideToggleArrow
                                >
                                    <table className="table-schema">
                                        {columns.map(column => (
                                            <tr>
                                                <td>{column.name}</td>
                                                <td>{column.type}</td>
                                            </tr>
                                        ))}
                                    </table>
                                </Dropdown>
                                {" "}
                            </>
                        ))}
                    </span>
                </>
            )}
        </div>
    );
}
