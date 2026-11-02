package com.repostcleaner.app

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.ConsoleMessage
import android.webkit.SafeBrowsingResponse
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var progress: ProgressBar
    private lateinit var statusText: TextView
    private val mainHandler = Handler(Looper.getMainLooper())

    companion object {
        private const val HOME = "https://www.instagram.com/"
        private fun isInstagramHost(host: String?): Boolean {
            val value = host?.lowercase() ?: return false
            return value == "instagram.com" || value.endsWith(".instagram.com")
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildScreen()
        configureWebView()
        if (savedInstanceState == null) webView.loadUrl(HOME)
        else webView.restoreState(savedInstanceState)
    }

    private fun buildScreen() {
        val page = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(17, 18, 26))
        }
        val toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(14), dp(8), dp(10), dp(8))
            setBackgroundColor(Color.rgb(25, 24, 39))
        }
        val title = TextView(this).apply {
            text = "Repost Cleaner"
            textSize = 17f
            setTextColor(Color.WHITE)
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }
        toolbar.addView(title, LinearLayout.LayoutParams(0, dp(42), 1f))
        val clearButton = Button(this).apply {
            text = "مسح الجلسة"
            textSize = 10f
            isAllCaps = false
            setOnClickListener { confirmClearSession() }
        }
        toolbar.addView(clearButton, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40)))
        page.addView(toolbar)

        statusText = TextView(this).apply {
            text = "افتح Instagram وسجّل دخولك داخل التطبيق."
            textSize = 11f
            setTextColor(Color.rgb(205, 198, 225))
            setPadding(dp(13), dp(7), dp(13), dp(7))
            setBackgroundColor(Color.rgb(31, 29, 47))
        }
        page.addView(statusText)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = true
            visibility = View.GONE
        }
        page.addView(progress, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)))

        webView = WebView(this).apply { setBackgroundColor(Color.WHITE) }
        page.addView(webView, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(page)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)

        webView.settings.apply {
            javaScriptEnabled = true // Instagram's website requires JavaScript.
            domStorageEnabled = true
            databaseEnabled = false
            allowFileAccess = false
            allowContentAccess = false
            allowFileAccessFromFileURLs = false
            allowUniversalAccessFromFileURLs = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
            mediaPlaybackRequiresUserGesture = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) safeBrowsingEnabled = true
            setGeolocationEnabled(false)
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    statusText.text = "خطأ في تشغيل واجهة الأداة: ${message.message()}"
                }
                return true
            }
        }
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "https" && isInstagramHost(uri.host)) return false
                // External links never stay inside the app's privileged WebView.
                if (uri.scheme == "https" || uri.scheme == "http") {
                    runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                    return true
                }
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                progress.visibility = View.VISIBLE
                statusText.text = "جاري فتح صفحة Instagram…"
            }

            override fun onPageFinished(view: WebView, url: String?) {
                progress.visibility = View.GONE
                val uri = runCatching { Uri.parse(url ?: "") }.getOrNull()
                if (uri != null && isInstagramHost(uri.host)) {
                    injectCleaner()
                    statusText.text = "تم تحميل Instagram داخل التطبيق؛ جاري التحقق من واجهة الأداة…"
                } else {
                    statusText.text = "تم فتح صفحة خارج Instagram في المتصفح الخارجي."
                }
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    progress.visibility = View.GONE
                    statusText.text = "خطأ تحميل: ${error.description}. أوقفنا الأداة؛ افحص الاتصال يدوياً."
                    nativeStop("WebView network error: ${error.description}")
                }
            }

            override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
                if (request.isForMainFrame && response.statusCode >= 400) {
                    statusText.text = "استجابة HTTP ${response.statusCode}. أوقفنا التشغيل لحين التحقق."
                    nativeStop("Instagram HTTP ${response.statusCode}")
                }
            }

            override fun onSafeBrowsingHit(
                view: WebView,
                request: WebResourceRequest,
                threatType: Int,
                callback: SafeBrowsingResponse
            ) {
                callback.backToSafety(true)
                statusText.text = "تم منع صفحة مشتبه بها بواسطة Safe Browsing."
                nativeStop("Safe Browsing threat")
            }
        }
    }

    private fun injectCleaner(attempt: Int = 0) {
        val currentUri = runCatching { Uri.parse(webView.url ?: "") }.getOrNull()
        if (currentUri == null || !isInstagramHost(currentUri.host)) return

        val script = runCatching {
            assets.open("cleaner.js").bufferedReader(Charsets.UTF_8).use { it.readText() }
        }.getOrElse {
            statusText.text = "تعذر تحميل محرك الأداة المحلي."
            return
        }

        webView.evaluateJavascript(script) {
            webView.evaluateJavascript(
                "(!!(window.RepostCleaner && document.getElementById('igrc-mobile-panel'))).toString()"
            ) { ready ->
                if (ready == '"true"') {
                    statusText.text = "الأداة جاهزة · افتح ملفك الشخصي ثم تبويب Reposts"
                } else if (attempt < 4) {
                    statusText.text = "جاري تهيئة واجهة الأداة (${attempt + 1}/5)…"
                    mainHandler.postDelayed({ injectCleaner(attempt + 1) }, 900)
                } else {
                    statusText.text = "تعذر تشغيل واجهة الأداة. حدّث Android System WebView ثم أعد فتح التطبيق."
                }
            }
        }
    }

    private fun nativeStop(reason: String) {
        val quoted = JSONObject.quote(reason)
        if (::webView.isInitialized) {
            webView.evaluateJavascript("window.RepostCleaner && window.RepostCleaner.nativeStop($quoted);", null)
        }
    }

    private fun confirmClearSession() {
        AlertDialog.Builder(this)
            .setTitle("مسح جلسة التطبيق؟")
            .setMessage("رح نمسح كوكيز وبيانات جلسة Instagram داخل هذا التطبيق فقط. ما رح نغيّر جلسة تطبيق Instagram الرسمي.")
            .setNegativeButton("إلغاء", null)
            .setPositiveButton("مسح الجلسة") { _, _ ->
                CookieManager.getInstance().removeAllCookies {
                    CookieManager.getInstance().flush()
                    webView.clearCache(true)
                    webView.clearHistory()
                    webView.loadUrl(HOME)
                    Toast.makeText(this, "تم مسح جلسة هذا التطبيق", Toast.LENGTH_SHORT).show()
                }
            }
            .show()
    }

    @Deprecated("Use system back navigation")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else showExitDialog()
    }

    private fun showExitDialog() {
        AlertDialog.Builder(this)
            .setMessage("بدك تطلع من Repost Cleaner؟")
            .setNegativeButton("إلغاء", null)
            .setPositiveButton("خروج") { _, _ -> finish() }
            .show()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (::webView.isInitialized) webView.saveState(outState)
    }

    override fun onPause() {
        if (::webView.isInitialized) webView.onPause()
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) webView.onResume()
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.loadUrl("about:blank")
            webView.removeAllViews()
            webView.destroy()
        }
        super.onDestroy()
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
