package com.laryvas.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebSettings;
import android.webkit.WebChromeClient;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.ValueCallback;
import android.webkit.JavascriptInterface;
import android.content.Intent;
import android.net.Uri;
import android.provider.MediaStore;
import android.content.ContentValues;
import android.widget.Toast;
import android.content.SharedPreferences;
import android.database.Cursor;
import java.io.OutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private WebViewAssetLoader assetLoader;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);
        assetLoader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        webView.addJavascriptInterface(new AppBridge(), "Android");
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = params.createIntent();
                try { startActivityForResult(intent, FILE_CHOOSER_REQUEST); }
                catch (Exception e) { fileCallback = null; return false; }
                return true;
            }
        });
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    private static final String PREFS_BACKUP = "laryvas_backup_prefs";
    private static final String PREF_LAST_AUTO = "last_auto_backup_ms";
    private static final int MAX_AUTO_BACKUPS = 7;
    private static final long AUTO_BACKUP_INTERVAL = 24L * 60L * 60L * 1000L;
    private boolean automaticBackupInProgress = false;

    private String nomeBackup(String prefixo) {
        return prefixo + new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date()) + ".json";
    }

    private Uri gravarBackupDownloads(String nome, String json) throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, nome);
        values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
        Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new Exception("Não foi possível criar o arquivo");
        try (OutputStream out = getContentResolver().openOutputStream(uri)) {
            if (out == null) throw new Exception("Não foi possível abrir o arquivo");
            out.write(json.getBytes("UTF-8"));
            out.flush();
        } catch (Exception e) {
            try { getContentResolver().delete(uri, null, null); } catch (Exception ignored) {}
            throw e;
        }
        return uri;
    }

    private void limparBackupsAutomaticosAntigos() {
        Cursor cursor = null;
        try {
            String[] projection = { MediaStore.Downloads._ID, MediaStore.Downloads.DISPLAY_NAME, MediaStore.Downloads.DATE_MODIFIED };
            cursor = getContentResolver().query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, projection,
                MediaStore.Downloads.DISPLAY_NAME + " LIKE ?", new String[]{"LARYVAS-auto-%"},
                MediaStore.Downloads.DATE_MODIFIED + " DESC");
            if (cursor == null) return;
            int encontrados = 0;
            while (cursor.moveToNext()) {
                encontrados++;
                if (encontrados > MAX_AUTO_BACKUPS) {
                    long id = cursor.getLong(cursor.getColumnIndexOrThrow(MediaStore.Downloads._ID));
                    Uri uri = Uri.withAppendedPath(MediaStore.Downloads.EXTERNAL_CONTENT_URI, String.valueOf(id));
                    getContentResolver().delete(uri, null, null);
                }
            }
        } catch (Exception e) {
            // A falha na limpeza nunca deve invalidar o backup recém-criado.
        } finally {
            if (cursor != null) cursor.close();
        }
    }

    private class AppBridge {
        @JavascriptInterface public void saveBackup(String json) {
            runOnUiThread(() -> {
                try {
                    gravarBackupDownloads(nomeBackup("LARYVAS-manual-"), json);
                    Toast.makeText(MainActivity.this, "Backup manual salvo em Downloads", Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Falha ao salvar backup manual", Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface public synchronized boolean shouldCreateAutomaticBackup() {
            if (automaticBackupInProgress) return false;
            SharedPreferences prefs = getSharedPreferences(PREFS_BACKUP, MODE_PRIVATE);
            long ultimo = prefs.getLong(PREF_LAST_AUTO, 0L);
            return System.currentTimeMillis() - ultimo >= AUTO_BACKUP_INTERVAL;
        }

        @JavascriptInterface public synchronized void saveAutomaticBackup(String json) {
            if (automaticBackupInProgress) return;
            automaticBackupInProgress = true;
            runOnUiThread(() -> {
                try {
                    gravarBackupDownloads(nomeBackup("LARYVAS-auto-"), json);
                    getSharedPreferences(PREFS_BACKUP, MODE_PRIVATE).edit()
                        .putLong(PREF_LAST_AUTO, System.currentTimeMillis()).apply();
                    limparBackupsAutomaticosAntigos();
                    Toast.makeText(MainActivity.this, "Backup automático diário salvo em Downloads", Toast.LENGTH_SHORT).show();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Não foi possível salvar o backup automático", Toast.LENGTH_LONG).show();
                } finally {
                    synchronized (AppBridge.this) { automaticBackupInProgress = false; }
                }
            });
        }

        @JavascriptInterface public String getLastAutomaticBackup() {
            long ultimo = getSharedPreferences(PREFS_BACKUP, MODE_PRIVATE).getLong(PREF_LAST_AUTO, 0L);
            if (ultimo <= 0L) return "";
            return new SimpleDateFormat("dd/MM/yyyy 'às' HH:mm", new Locale("pt", "BR")).format(new Date(ultimo));
        }

        @JavascriptInterface public String getAutomaticBackups() {
            org.json.JSONArray resultado = new org.json.JSONArray();
            Cursor cursor = null;
            try {
                String[] projection = { MediaStore.Downloads.DISPLAY_NAME, MediaStore.Downloads.DATE_MODIFIED };
                cursor = getContentResolver().query(MediaStore.Downloads.EXTERNAL_CONTENT_URI, projection,
                    MediaStore.Downloads.DISPLAY_NAME + " LIKE ?", new String[]{"LARYVAS-auto-%"},
                    MediaStore.Downloads.DATE_MODIFIED + " DESC");
                if (cursor != null) {
                    int nomeCol = cursor.getColumnIndexOrThrow(MediaStore.Downloads.DISPLAY_NAME);
                    int dataCol = cursor.getColumnIndexOrThrow(MediaStore.Downloads.DATE_MODIFIED);
                    int limite = 0;
                    while (cursor.moveToNext() && limite < MAX_AUTO_BACKUPS) {
                        String nome = cursor.getString(nomeCol);
                        long segundos = cursor.getLong(dataCol);
                        String data = new SimpleDateFormat("dd/MM/yyyy HH:mm", new Locale("pt", "BR")).format(new Date(segundos * 1000L));
                        resultado.put(nome + " — " + data);
                        limite++;
                    }
                }
            } catch (Exception ignored) {
                // A consulta é apenas informativa; não interfere nos arquivos de backup.
            } finally { if (cursor != null) cursor.close(); }
            return resultado.toString();
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileCallback != null) {
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            fileCallback.onReceiveValue(results);
            fileCallback = null;
        }
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
