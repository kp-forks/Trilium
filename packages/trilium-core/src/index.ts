import { ExecutionContext, initContext } from "./services/context";
import { CryptoProvider, initCrypto } from "./services/encryption/crypto";
import { getLog, initLog } from "./services/log";
import { initSql } from "./services/sql/index";
import { SqlService, SqlServiceParams } from "./services/sql/sql";
import { initMessaging, MessagingProvider } from "./services/messaging/index";
import { initRequest, RequestProvider } from "./services/request";
import { initTranslations, TranslationProvider } from "./services/i18n";
import { initSchema } from "./services/sql_init";
import appInfo from "./services/app_info";
import { type PlatformProvider, initPlatform } from "./services/platform";

export { getLog } from "./services/log";
export type * from "./services/sql/types";
export * from "./services/sql/index";
export { default as sql_init } from "./services/sql_init";
export * as protected_session from "./services/protected_session";
export { default as data_encryption } from "./services/encryption/data_encryption"
export * as binary_utils from "./services/utils/binary";
export * as utils from "./services/utils/index";
export * from "./services/build";
export { default as date_utils } from "./services/utils/date";
export { default as events } from "./services/events";
export { default as blob } from "./services/blob";
export { default as options } from "./services/options";
export * as options_init from "./services/options_init";
export { default as app_info } from "./services/app_info";
export { default as keyboard_actions } from "./services/keyboard_actions";
export { default as entity_changes } from "./services/entity_changes";
export { default as hidden_subtree } from "./services/hidden_subtree";
export * as icon_packs from "./services/icon_packs";
export { getContext, type ExecutionContext } from "./services/context";
export * as cls from "./services/context";
export * as i18n from "./services/i18n";
export * from "./errors";
export { default as getInstanceId } from "./services/instance_id";
export type { CryptoProvider } from "./services/encryption/crypto";
export { default as note_types } from "./services/note_types";
export { default as tree } from "./services/tree";
export { default as cloning } from "./services/cloning";
export { default as handlers } from "./services/handlers";
export { default as TaskContext } from "./services/task_context";
export { default as revisions } from "./services/revisions";
export { default as erase } from "./services/erase";
export { default as getSharedBootstrapItems } from "./services/bootstrap_utils";
export { default as branches } from "./services/branches";
export { default as bulk_actions } from "./services/bulk_actions";
export { default as hoisted_note } from "./services/hoisted_note";
export { default as special_notes } from "./services/special_notes";
export { default as date_notes } from "./services/date_notes";
export { getCrypto } from "./services/encryption/crypto";

export { default as attribute_formatter} from "./services/attribute_formatter";
export { default as attributes } from "./services/attributes";

// Messaging system
export * from "./services/messaging/index";
export type { MessagingProvider, ServerMessagingProvider, MessageClient, MessageHandler } from "./services/messaging/types";

export { default as becca } from "./becca/becca";
export { default as becca_loader } from "./becca/becca_loader";
export { default as becca_service } from "./becca/becca_service";
export { default as entity_constructor } from "./becca/entity_constructor";
export { default as similarity } from "./becca/similarity";
export { default as BAttachment } from "./becca/entities/battachment";
export { default as BAttribute } from "./becca/entities/battribute";
export { default as BBlob } from "./becca/entities/bblob";
export { default as BBranch } from "./becca/entities/bbranch";
export { default as BEtapiToken } from "./becca/entities/betapi_token";
export { default as BNote } from "./becca/entities/bnote";
export { default as BOption } from "./becca/entities/boption";
export { default as BRecentNote } from "./becca/entities/brecent_note";
export { default as BRevision } from "./becca/entities/brevision";
export { default as AbstractBeccaEntity } from "./becca/entities/abstract_becca_entity";
export { default as Becca } from "./becca/becca-interface";
export type { NotePojo } from "./becca/becca-interface";

export { default as NoteSet } from "./services/search/note_set";
export { default as SearchContext } from "./services/search/search_context";
export { default as search, } from "./services/search/services/search";
export { type default as SearchResult } from "./services/search/search_result";
export { type SearchParams } from "./services/search/services/types";
export { default as note_service } from "./services/notes";
export type { NoteParams } from "./services/notes";
export * as sanitize from "./services/sanitizer";
export * as routes from "./routes";
export { default as ws } from "./services/ws";
export { default as request } from "./services/request";
export { default as sync_options } from "./services/sync_options";
export { default as sync_update } from "./services/sync_update";
export { default as sync } from "./services/sync";
export { default as consistency_checks } from "./services/consistency_checks";
export { default as content_hash } from "./services/content_hash";
export { default as sync_mutex } from "./services/sync_mutex";
export { default as setup } from "./services/setup";
export { getPlatform, type PlatformProvider } from "./services/platform";
export { t } from "i18next";
export type { RequestProvider, ExecOpts, CookieJar } from "./services/request";
export type * from "./meta";
export * as routeHelpers from "./routes/helpers";

export * as becca_easy_mocking from "./test/becca_easy_mocking";
export * as becca_mocking from "./test/becca_mocking";

export async function initializeCore({ dbConfig, executionContext, crypto, translations, messaging, request, schema, extraAppInfo, platform }: {
    dbConfig: SqlServiceParams,
    executionContext: ExecutionContext,
    crypto: CryptoProvider,
    translations: TranslationProvider,
    platform: PlatformProvider,
    schema: string,
    messaging?: MessagingProvider,
    request?: RequestProvider,
    extraAppInfo?: {
        nodeVersion: string;
        dataDirectory: string;
    };
}) {
    initPlatform(platform);
    initLog();
    await initTranslations(translations);
    initCrypto(crypto);
    initContext(executionContext);
    initSql(new SqlService(dbConfig, getLog()));
    initSchema(schema);
    Object.assign(appInfo, extraAppInfo);
    if (messaging) {
        initMessaging(messaging);
    }
    if (request) {
        initRequest(request);
    }
};
