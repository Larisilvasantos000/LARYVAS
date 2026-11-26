package com.laryvas.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.os.Build;
import android.os.Environment;
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
import java.io.File;
import java.io.FileOutputStream;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Arrays;
import java.util.Comparator;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int MANUAL_BACKUP_REQUEST = 1002;
    private static final String PREFS_BACKUP = "laryvas_backup_prefs";
    private static final String PREF_LAST_AUTO = "last_auto_backup_ms";
    private static final int MAX_AUTO_BACKUPS = 7;
    private static final long AUTO_BACKUP_INTERVAL = 24L * 60L * 60L * 1000L;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private WebViewAssetLoader assetLoader;
    private volatile boolean automaticBackupInProgress = false;
    private String pendingManualBackupJson;

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
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new AppBridge(), "Android");

        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return tratarNavegacao(request.getUrl());
            }

            // Necessário também para WebViews antigos (API 23), que podem chamar esta sobrecarga.
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return tratarNavegacao(Uri.parse(url));
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (Exception e) {
                    fileCallback = null;
                    callback.onReceiveValue(null);
                    Toast.makeText(MainActivity.this, "Não foi possível abrir os arquivos", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    private boolean tratarNavegacao(Uri uri) {
        String scheme = uri.getScheme();
        boolean recursoInterno = "https".equalsIgnoreCase(scheme)
            && "appassets.androidplatform.net".equalsIgnoreCase(uri.getHost())
            && uri.getPath() != null && uri.getPath().startsWith("/assets/");
        if (recursoInterno) return false;

        if ("https".equalsIgnoreCase(scheme) || "http".equalsIgnoreCase(scheme)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (Exception e) {
                Toast.makeText(this, "Não foi possível abrir este link", Toast.LENGTH_SHORT).show();
            }
        }
        // Esquemas externos (intent:, file:, javascript:, content: etc.) não navegam no WebView.
        return true;
    }

    private String nomeBackup(String prefixo) {
        return prefixo + new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date()) + ".json";
    }

    // Backup manual usa o seletor oficial do Android em todas as versões suportadas.
    private void solicitarDestinoBackupManual(String json) {
        pendingManualBackupJson = json;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, nomeBackup("LARYVAS-manual-"));
        try {
            startActivityForResult(intent, MANUAL_BACKUP_REQUEST);
        } catch (Exception e) {
            pendingManualBackupJson = null;
            Toast.makeText(this, "Não foi possível abrir o seletor para salvar o backup", Toast.LENGTH_LONG).show();
        }
    }

    private void gravarJsonEmUri(Uri uri, String json) throws Exception {
        try (OutputStream out = getContentResolver().openOutputStream(uri, "w")) {
            if (out == null) throw new Exception("Não foi possível abrir o destino escolhido");
            out.write(json.getBytes("UTF-8"));
            out.flush();
        }
    }

    // Android 10+ grava na pasta Downloads via MediaStore, sem pedir permissão ampla.
    // Android 6–9 usa a pasta externa privada do app, sem depender de APIs indisponíveis.
    private void gravarBackupAutomatico(String nome, String json) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, nome);
            values.put(MediaStore.Downloads.MIME_TYPE, "application/json");
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new Exception("Não foi possível criar o backup em Downloads");
            try {
                gravarJsonEmUri(uri, json);
            } catch (Exception e) {
                try { getContentResolver().delete(uri, null, null); } catch (Exception ignored) {}
                throw e;
            }
        } else {
            File pasta = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (pasta == null) pasta = new File(getFilesDir(), "backups");
            if (!pasta.exists() && !pasta.mkdirs()) throw new Exception("Não foi possível criar a pasta de backup");
            File destino = new File(pasta, nome);
            try (FileOutputStream out = new FileOutputStream(destino)) {
                out.write(json.getBytes("UTF-8"));
                out.flush();
            }
        }
    }

    private void limparBackupsAutomaticosAntigos() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
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
            } catch (Exception ignored) {
                // Limpeza é acessória; não deve invalidar um backup já criado.
            } finally {
                if (cursor != null) cursor.close();
            }
        } else {
            File pasta = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (pasta == null) pasta = new File(getFilesDir(), "backups");
            File[] arquivos = pasta.listFiles((dir, name) -> name.startsWith("LARYVAS-auto-") && name.endsWith(".json"));
            if (arquivos == null || arquivos.length <= MAX_AUTO_BACKUPS) return;
            Arrays.sort(arquivos, Comparator.comparingLong(File::lastModified).reversed());
            for (int i = MAX_AUTO_BACKUPS; i < arquivos.length; i++) arquivos[i].delete();
        }
    }

    private org.json.JSONArray listarBackupsAutomaticos() {
        org.json.JSONArray resultado = new org.json.JSONArray();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
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
                // A consulta é apenas informativa.
            } finally {
                if (cursor != null) cursor.close();
            }
        } else {
            File pasta = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (pasta == null) pasta = new File(getFilesDir(), "backups");
            File[] arquivos = pasta.listFiles((dir, name) -> name.startsWith("LARYVAS-auto-") && name.endsWith(".json"));
            if (arquivos != null) {
                Arrays.sort(arquivos, Comparator.comparingLong(File::lastModified).reversed());
                for (int i = 0; i < Math.min(arquivos.length, MAX_AUTO_BACKUPS); i++) {
                    String data = new SimpleDateFormat("dd/MM/yyyy HH:mm", new Locale("pt", "BR")).format(new Date(arquivos[i].lastModified()));
                    resultado.put(arquivos[i].getName() + " — " + data);
                }
            }
        }
        return resultado;
    }

    private class AppBridge {
        @JavascriptInterface public void saveBackup(String json) {
            // O backup manual usa o mesmo destino nativo já validado pelos backups
            // automáticos: Downloads no Android 10+ e pasta privada do app no Android 6–9.
            runOnUiThread(() -> {
                if (json == null || json.trim().isEmpty()) {
                    Toast.makeText(MainActivity.this, "Não há dados para salvar no backup", Toast.LENGTH_LONG).show();
                    return;
                }
                try {
                    gravarBackupAutomatico(nomeBackup("LARYVAS-manual-"), json);
                    String destino = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                        ? "Downloads"
                        : "Downloads privado do aplicativo";
                    Toast.makeText(MainActivity.this,
                        "Backup manual salvo em " + destino, Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this,
                        "Falha ao salvar o backup manual: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }

        @JavascriptInterface public synchronized boolean shouldCreateAutomaticBackup() {
            if (automaticBackupInProgress) return false;
            long ultimo = getSharedPreferences(PREFS_BACKUP, MODE_PRIVATE).getLong(PREF_LAST_AUTO, 0L);
            return System.currentTimeMillis() - ultimo >= AUTO_BACKUP_INTERVAL;
        }

        @JavascriptInterface public synchronized void saveAutomaticBackup(String json) {
            if (automaticBackupInProgress) return;
            automaticBackupInProgress = true;
            runOnUiThread(() -> {
                try {
                    gravarBackupAutomatico(nomeBackup("LARYVAS-auto-"), json);
                    getSharedPreferences(PREFS_BACKUP, MODE_PRIVATE).edit()
                        .putLong(PREF_LAST_AUTO, System.currentTimeMillis()).apply();
                    limparBackupsAutomaticosAntigos();
                    String local = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? "em Downloads" : "na pasta privada do aplicativo";
                    Toast.makeText(MainActivity.this, "Backup automático salvo " + local, Toast.LENGTH_SHORT).show();
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
            return listarBackupsAutomaticos().toString();
        }

        @JavascriptInterface public String getAutomaticBackupLocation() {
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? "Downloads"
                : "pasta privada do aplicativo (Android/data; pode ser removida ao desinstalar o app)";
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && fileCallback != null) {
            Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            fileCallback.onReceiveValue(results);
            fileCallback = null;
        } else if (requestCode == MANUAL_BACKUP_REQUEST) {
            String json = pendingManualBackupJson;
            pendingManualBackupJson = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && json != null) {
                try {
                    gravarJsonEmUri(data.getData(), json);
                    Toast.makeText(this, "Backup manual salvo com sucesso", Toast.LENGTH_LONG).show();
                } catch (Exception e) {
                    Toast.makeText(this, "Falha ao gravar o backup escolhido", Toast.LENGTH_LONG).show();
                }
            } else {
                Toast.makeText(this, "Salvamento do backup cancelado", Toast.LENGTH_SHORT).show();
            }
        }
    }

    @Override public void onBackPressed() {
        if (webView == null) { super.onBackPressed(); return; }
        webView.evaluateJavascript(
            "window.laryvasHandleAndroidBack ? window.laryvasHandleAndroidBack() : false",
            value -> {
                if ("true".equals(value)) return;
                new AlertDialog.Builder(MainActivity.this)
                    .setMessage("Deseja sair do LARYVAS?")
                    .setNegativeButton("Cancelar", (dialog, which) -> dialog.dismiss())
                    .setPositiveButton("Sair", (dialog, which) -> finish())
                    .show();
            }
        );
    }

    @Override protected void onDestroy() {
        if (fileCallback != null) {
            fileCallback.onReceiveValue(null);
            fileCallback = null;
        }
        if (webView != null) {
            webView.removeJavascriptInterface("Android");
            webView.stopLoading();
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
