package com.mirabid.isdesign;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/** Hosts the offline IS StructDesign web app (assets/index.html) in a WebView. */
public class MainActivity extends Activity {
    private WebView web;
    private ValueCallback<Uri[]> fileCb;
    private byte[] pendingSave;
    private String pendingOpen;
    private static final int REQ_OPEN = 11, REQ_SAVE = 12;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // saved inputs (localStorage)
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        // background analysis workers read the engine scripts from the app's own assets
        s.setAllowFileAccessFromFileURLs(true);
        // smooth scrolling and GPU drawing: hardware layer, pre-rasterise off-screen content, keep the renderer at high priority
        web.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        if (Build.VERSION.SDK_INT >= 23) s.setOffscreenPreRaster(true);
        if (Build.VERSION.SDK_INT >= 26) web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView v, String url) { deliverOpen(); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            /* <input type="file"> for DXF import */
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try { startActivityForResult(i, REQ_OPEN); } catch (Exception e) { fileCb = null; return false; }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");
        setContentView(web);
        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl("file:///android_asset/index.html");
        handleView(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) { super.onNewIntent(intent); handleView(intent); deliverOpen(); }

    /* a .dxf opened from a file manager / e-mail ("Open with IS StructDesign") */
    private void handleView(Intent it) {
        if (it == null || !Intent.ACTION_VIEW.equals(it.getAction()) || it.getData() == null) return;
        try {
            String txt = readText(it.getData());
            JSONObject o = new JSONObject(); o.put("name", "opened.dxf"); o.put("text", txt);
            pendingOpen = o.toString();
        } catch (Exception e) { Toast.makeText(this, "Could not read file: " + e.getMessage(), Toast.LENGTH_LONG).show(); }
    }
    private void deliverOpen() {
        if (pendingOpen == null || web == null) return;
        final String js = "(function(o){location.hash='#model';setTimeout(function(){if(window.SU)SU.openText(o.name,o.text);},300);})(" + pendingOpen + ")";
        pendingOpen = null;
        web.evaluateJavascript(js, null);
    }
    private String readText(Uri u) throws Exception {
        InputStream in = getContentResolver().openInputStream(u);
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] b = new byte[65536]; int n;
        while ((n = in.read(b)) > 0) bo.write(b, 0, n);
        in.close();
        return new String(bo.toByteArray(), StandardCharsets.ISO_8859_1);
    }

    /* offer to open the saved workbook in Excel / Sheets / WPS */
    private void openSaved(Uri u) {
        try {
            Intent v = new Intent(Intent.ACTION_VIEW);
            v.setDataAndType(u, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
            v.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(v, "Open workbook with"));
        } catch (Exception ignored) { }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_OPEN && fileCb != null) {
            Uri u = (res == RESULT_OK && data != null) ? data.getData() : null;
            fileCb.onReceiveValue(u != null ? new Uri[]{u} : null);
            fileCb = null;
        } else if (req == REQ_SAVE) {
            if (res == RESULT_OK && data != null && data.getData() != null && pendingSave != null) {
                try (OutputStream os = getContentResolver().openOutputStream(data.getData())) {
                    os.write(pendingSave);
                    Toast.makeText(this, "Saved", Toast.LENGTH_SHORT).show();
                    if (pendingSave.length > 4 && pendingSave[0] == 'P' && pendingSave[1] == 'K') openSaved(data.getData());
                } catch (Exception e) { Toast.makeText(this, "Save failed: " + e.getMessage(), Toast.LENGTH_LONG).show(); }
            }
            pendingSave = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    /** Called from JavaScript: print / save the current report as PDF, share text. */
    private class Bridge {
        @JavascriptInterface
        public void print(final String title) {
            runOnUiThread(() -> {
                PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                String name = "IS StructDesign - " + title;
                PrintDocumentAdapter adapter = web.createPrintDocumentAdapter(name);
                pm.print(name, adapter, new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4).build());
            });
        }

        /** Save exported DXF / CSV through the system "Save to" picker (no storage permission needed). */
        @JavascriptInterface
        public void saveFile(final String name, final String text) {
            save(name, text.getBytes(StandardCharsets.UTF_8), name.endsWith(".csv") ? "text/csv" : "application/octet-stream");
        }

        /** Binary files (Excel .xlsx) arrive base64-encoded from JavaScript. */
        @JavascriptInterface
        public void saveFileB64(final String name, final String b64, final String mime) {
            save(name, android.util.Base64.decode(b64, android.util.Base64.DEFAULT), mime);
        }

        private void save(final String name, final byte[] data, final String mime) {
            runOnUiThread(() -> {
                pendingSave = data;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_TITLE, name);
                startActivityForResult(i, REQ_SAVE);
            });
        }

        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_SEND);
                i.setType("text/plain");
                i.putExtra(Intent.EXTRA_TEXT, text);
                startActivity(Intent.createChooser(i, "Share design summary"));
            });
        }
    }
}
