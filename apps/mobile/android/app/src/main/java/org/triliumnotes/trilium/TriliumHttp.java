package org.triliumnotes.trilium;

import android.text.TextUtils;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.plugin.util.CapacitorHttpUrlConnection;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Minimal HTTP plugin used by the sync worker instead of CapacitorHttp.
 *
 * CapacitorHttp force-parses any response whose Content-Type is application/json into an
 * org.json object tree and then re-serializes it into the bridge message ("backward
 * compatibility" branch in HttpRequestHandler.readData), ignoring the requested
 * responseType. For multi-megabyte sync pull responses that costs two full JSON passes and
 * hundreds of thousands of short-lived Java objects per request — measured at ~60% of a CPU
 * core for the duration of an initial sync. This plugin performs the same request via
 * CapacitorHttpUrlConnection but always returns the body as a single string (or base64 for
 * binary), leaving JSON parsing to the web worker that actually consumes it.
 */
@CapacitorPlugin(name = "TriliumHttp")
public class TriliumHttp extends Plugin {

    private static final int CONNECT_TIMEOUT_MS = 30_000;
    // The JS side enforces its own (configurable) sync timeout; this is only a backstop so a
    // dead connection cannot pin a native thread forever.
    private static final int READ_TIMEOUT_MS = 600_000;

    private ExecutorService executor;

    @Override
    public void load() {
        executor = Executors.newCachedThreadPool();
        super.load();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (executor != null) {
            executor.shutdownNow();
        }
    }

    @PluginMethod
    public void request(final PluginCall call) {
        if (executor == null || executor.isShutdown()) {
            call.reject("Failed to execute request - TriliumHttp plugin was shut down");
            return;
        }

        executor.submit(() -> {
            try {
                call.resolve(doRequest(call));
            } catch (Exception e) {
                call.reject(e.getLocalizedMessage(), e.getClass().getSimpleName(), e);
            }
        });
    }

    private JSObject doRequest(PluginCall call) throws Exception {
        String urlString = call.getString("url");
        if (urlString == null) {
            throw new IllegalArgumentException("url is required");
        }
        String method = call.getString("method", "GET").toUpperCase();
        JSObject headers = call.getObject("headers", new JSObject());
        String body = call.getString("data");
        String responseType = call.getString("responseType", "text");

        URL url = new URL(urlString);
        CapacitorHttpUrlConnection connection = new CapacitorHttpUrlConnection((HttpURLConnection) url.openConnection());

        try {
            connection.setAllowUserInteraction(false);
            connection.setRequestMethod(method);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setRequestHeaders(headers);
            connection.setSSLSocketFactory(getBridge());

            if (body != null && !"GET".equals(method) && !"HEAD".equals(method)) {
                connection.setDoOutput(true);
                try (OutputStream os = connection.getHttpConnection().getOutputStream()) {
                    os.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }

            connection.connect();

            int status = connection.getResponseCode();

            JSObject responseHeaders = new JSObject();
            for (Map.Entry<String, List<String>> entry : connection.getHttpConnection().getHeaderFields().entrySet()) {
                // The status line arrives as a header with a null key — skip it.
                if (entry.getKey() != null) {
                    responseHeaders.put(entry.getKey(), TextUtils.join(", ", entry.getValue()));
                }
            }

            InputStream stream = connection.getErrorStream();
            if (stream == null) {
                stream = connection.getInputStream();
            }

            String data;
            if (stream == null) {
                data = "";
            } else if ("arraybuffer".equals(responseType) || "blob".equals(responseType)) {
                data = Base64.encodeToString(readFully(stream), Base64.NO_WRAP);
            } else {
                data = new String(readFully(stream), StandardCharsets.UTF_8);
            }

            JSObject result = new JSObject();
            result.put("status", status);
            result.put("headers", responseHeaders);
            result.put("data", data);
            return result;
        } finally {
            connection.disconnect();
        }
    }

    private static byte[] readFully(InputStream stream) throws Exception {
        try (InputStream in = stream) {
            ByteArrayOutputStream out = new ByteArrayOutputStream(64 * 1024);
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return out.toByteArray();
        }
    }
}
