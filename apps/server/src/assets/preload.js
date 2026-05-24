const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("electronApi", {});
