package se.shabbyf.schackcypher;

import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.core.content.FileProvider;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

/**
 * Visar webbappen i www/ i en helskärms-WebView.
 * Filerna serveras från https://appassets.androidplatform.net/ så att
 * Stockfish (Web Worker + WebAssembly) får laddas som från en vanlig webbplats.
 *
 * Bryggan CypherApp ger webbappen uppläsning (Android TTS, eftersom WebView saknar
 * Web Speech) och automatiska uppdateringar från GitHub Releases.
 */
public class MainActivity extends Activity {

    private static final String START_URL =
            "https://appassets.androidplatform.net/assets/www/index.html?tv=1";
    private static final String RELEASES_API =
            "https://api.github.com/repos/Shabbyf/schack-cypher/releases/latest";

    private WebView web;
    private long lastBack = 0;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        web = new WebView(this);
        web.setBackgroundColor(0xFF161512);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                return !"appassets.androidplatform.net".equals(u.getHost());
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "CypherApp");

        tts = new TextToSpeech(this, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int r = tts.setLanguage(new Locale("sv", "SE"));
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts.setLanguage(Locale.getDefault());
                }
                ttsReady = true;
            }
        });

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(START_URL);
        }
        web.requestFocus(View.FOCUS_DOWN);
    }

    private void js(String code) {
        main.post(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    private static String q(String s) {
        return JSONObject.quote(s == null ? "" : s);
    }

    private int versionCode() {
        try {
            PackageInfo p = getPackageManager().getPackageInfo(getPackageName(), 0);
            return Build.VERSION.SDK_INT >= 28 ? (int) p.getLongVersionCode() : p.versionCode;
        } catch (Exception e) {
            return 0;
        }
    }

    /** Metoder som webbappen når via window.CypherApp. */
    private class Bridge {
        @JavascriptInterface
        public String getVersionName() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "?";
            }
        }

        @JavascriptInterface
        public int getVersionCode() {
            return versionCode();
        }

        @JavascriptInterface
        public String getDeviceInfo() {
            try {
                JSONObject o = new JSONObject();
                o.put("model", Build.MANUFACTURER + " " + Build.MODEL);
                o.put("android", Build.VERSION.RELEASE + " (API " + Build.VERSION.SDK_INT + ")");
                PackageInfo wv = WebViewCompat.getCurrentWebViewPackage(MainActivity.this);
                o.put("webview", wv != null ? wv.packageName + " " + wv.versionName : "okänd");
                ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                o.put("ram", (mi.totalMem / (1024 * 1024)) + " MB totalt, " + (mi.availMem / (1024 * 1024)) + " MB ledigt"
                        + (mi.lowMemory ? " (lite minne)" : "") + ", app-gräns " + am.getMemoryClass() + " MB");
                return o.toString();
            } catch (Exception e) {
                return "{}";
            }
        }

        @JavascriptInterface
        public void speak(String text, float pitch, float rate) {
            if (!ttsReady) return;
            tts.setPitch(pitch);
            tts.setSpeechRate(rate);
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "cypher");
        }

        @JavascriptInterface
        public void stopSpeaking() {
            if (ttsReady) tts.stop();
        }

        @JavascriptInterface
        public void checkForUpdate() {
            new Thread(() -> {
                try {
                    JSONObject rel = new JSONObject(get(RELEASES_API));
                    String tag = rel.optString("tag_name", "");
                    int code = Integer.parseInt(tag.substring(tag.lastIndexOf('.') + 1));
                    String url = null;
                    JSONArray assets = rel.optJSONArray("assets");
                    if (assets != null) {
                        for (int i = 0; i < assets.length(); i++) {
                            JSONObject a = assets.getJSONObject(i);
                            if (a.optString("name").endsWith(".apk")) url = a.optString("browser_download_url");
                        }
                    }
                    if (code > versionCode() && url != null) {
                        JSONObject o = new JSONObject();
                        o.put("status", "available");
                        o.put("version", tag.replaceFirst("^v", ""));
                        o.put("url", url);
                        o.put("notes", rel.optString("body", ""));
                        js("window.__cypherUpdate&&window.__cypherUpdate(" + o + ")");
                    } else {
                        js("window.__cypherUpdate&&window.__cypherUpdate({status:'none'})");
                    }
                } catch (Exception e) {
                    js("window.__cypherUpdate&&window.__cypherUpdate({status:'error',message:" + q(e.getMessage()) + "})");
                }
            }).start();
        }

        @JavascriptInterface
        public void installUpdate(String url) {
            if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
                main.post(() -> {
                    startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + getPackageName())));
                    js("window.__cypherInstallPermission&&window.__cypherInstallPermission()");
                });
                return;
            }
            new Thread(() -> {
                try {
                    File dir = new File(getCacheDir(), "updates");
                    dir.mkdirs();
                    File apk = new File(dir, "schack-cypher.apk");
                    download(url, apk);
                    Uri uri = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", apk);
                    Intent i = new Intent(Intent.ACTION_VIEW);
                    i.setDataAndType(uri, "application/vnd.android.package-archive");
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    main.post(() -> startActivity(i));
                } catch (Exception e) {
                    js("window.__cypherUpdate&&window.__cypherUpdate({status:'error',stage:'install',message:" + q(e.getMessage()) + "})");
                }
            }).start();
        }
    }

    private static HttpURLConnection open(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(15000);
        c.setReadTimeout(30000);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", "SchackCypher");
        c.setRequestProperty("Accept", "application/vnd.github+json, */*");
        return c;
    }

    private static String get(String url) throws Exception {
        HttpURLConnection c = open(url);
        try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), "UTF-8"))) {
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = r.readLine()) != null) sb.append(line).append('\n');
            return sb.toString();
        } finally {
            c.disconnect();
        }
    }

    // Följer GitHubs omdirigering till objects.githubusercontent.com och rapporterar förlopp.
    private void download(String url, File dest) throws Exception {
        HttpURLConnection c = open(url);
        int hops = 0;
        while ((c.getResponseCode() / 100) == 3 && hops++ < 5) {
            String loc = c.getHeaderField("Location");
            c.disconnect();
            c = open(loc);
        }
        if (c.getResponseCode() != 200) throw new Exception("HTTP " + c.getResponseCode());
        long total = c.getContentLengthLong();
        try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(dest)) {
            byte[] buf = new byte[64 * 1024];
            long done = 0;
            int n, lastPct = -1;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                done += n;
                if (total > 0) {
                    int pct = (int) (done * 100 / total);
                    if (pct != lastPct && pct % 5 == 0) {
                        lastPct = pct;
                        js("window.__cypherUpdateProgress&&window.__cypherUpdateProgress(" + pct + ")");
                    }
                }
            }
        } finally {
            c.disconnect();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int code = e.getKeyCode();
        String color = null;
        switch (code) {
            case KeyEvent.KEYCODE_PROG_RED: color = "red"; break;
            case KeyEvent.KEYCODE_PROG_GREEN: color = "green"; break;
            case KeyEvent.KEYCODE_PROG_YELLOW: color = "yellow"; break;
            case KeyEvent.KEYCODE_PROG_BLUE: color = "blue"; break;
            default: break;
        }
        if (color != null) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
                web.evaluateJavascript("window.tvKey&&window.tvKey('" + color + "')", null);
            }
            return true;
        }

        if (code == KeyEvent.KEYCODE_BACK) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
                web.evaluateJavascript("window.tvBack?window.tvBack():false", value -> {
                    if ("true".equals(value)) return;
                    long now = System.currentTimeMillis();
                    if (now - lastBack < 2000) {
                        finish();
                    } else {
                        lastBack = now;
                        Toast.makeText(this, "Tryck Tillbaka igen för att avsluta", Toast.LENGTH_SHORT).show();
                    }
                });
            }
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    @Override
    protected void onDestroy() {
        if (tts != null) tts.shutdown();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
