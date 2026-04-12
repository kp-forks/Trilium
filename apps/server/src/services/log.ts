import { getLog } from "@triliumnext/core";
import type { Request, Response } from "express";
import type ServerLogService from "../log_provider.js";

function getServerLog(): ServerLogService {
    return getLog() as ServerLogService;
}

function info(message: string | Error) {
    getServerLog().info(message);
}

function error(message: string | Error | unknown) {
    getServerLog().error(message);
}

function request(req: Request, res: Response, timeMs: number, responseLength: number | string = "?") {
    getServerLog().request(req, res, timeMs, responseLength);
}

export default {
    info,
    error,
    request
};
