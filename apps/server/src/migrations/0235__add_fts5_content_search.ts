import sql from "../services/sql.js";
import log from "../services/log.js";

export default () => {
    sql.execute(/*sql*/`
        CREATE VIRTUAL TABLE IF NOT EXISTS note_content_fts USING fts5(
            noteId UNINDEXED,
            content,
            tokenize='unicode61 remove_diacritics 2'
        )
    `);

    log.info("Created note_content_fts table. FTS index will be populated on first search.");
};
