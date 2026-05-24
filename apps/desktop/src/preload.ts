import { contextBridge, webFrame } from "electron";

contextBridge.exposeInMainWorld("electronApi", {
    setZoomFactor(factor: number) {
        webFrame.setZoomFactor(factor);
    },
    getZoomFactor(): number {
        return webFrame.getZoomFactor();
    }
});
