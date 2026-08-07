package com.agratec.fieldapp.data.repository

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import com.agratec.fieldapp.BuildConfig
import com.agratec.fieldapp.data.remote.RetrofitClient

/**
 * Auto-actualización: al arrancar (con internet) consulta la versión de APK
 * publicada en el servidor; si hay una más nueva ofrece descargarla.
 */
class UpdateRepository(private val context: Context) {

    companion object {
        private const val TAG = "UpdateRepo"
    }

    data class UpdateInfo(
        val versionCode: Int,
        val versionName: String,
        val notes: String?,
        val fileSizeMb: Double?,
        val downloadUrl: String,
    )

    /** null = no hay actualización disponible (o no se pudo consultar) */
    suspend fun checkForUpdate(): UpdateInfo? {
        return try {
            val api = RetrofitClient.getApiService(context)
            val response = api.getAppVersion()
            if (!response.isSuccessful) return null
            val body = response.body() ?: return null
            if (body.available != true) return null
            val remoteCode = body.versionCode ?: return null
            if (remoteCode <= BuildConfig.VERSION_CODE) return null

            val base = BuildConfig.BASE_URL.trimEnd('/')
            UpdateInfo(
                versionCode = remoteCode,
                versionName = body.versionName ?: remoteCode.toString(),
                notes = body.notes,
                fileSizeMb = body.fileSize?.let { it / (1024.0 * 1024.0) },
                downloadUrl = base + (body.downloadUrl ?: "/api/mobile/app-download"),
            )
        } catch (e: Exception) {
            Log.d(TAG, "Sin conexión o error consultando actualización: ${e.message}")
            null
        }
    }

    /** Abre el navegador para descargar el APK (el usuario lo instala al terminar) */
    fun openDownload(info: UpdateInfo) {
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(info.downloadUrl))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "No se pudo abrir la descarga", e)
        }
    }
}
