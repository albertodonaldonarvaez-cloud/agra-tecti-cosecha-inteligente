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

    /** Resultado detallado, para poder informar al usuario cuando lo pide a mano */
    sealed class CheckResult {
        data class Available(val info: UpdateInfo) : CheckResult()
        data class UpToDate(val currentVersion: String) : CheckResult()
        data class Error(val message: String) : CheckResult()
    }

    /** null = no hay actualización disponible (o no se pudo consultar) */
    suspend fun checkForUpdate(): UpdateInfo? =
        (check() as? CheckResult.Available)?.info

    /** Consulta con detalle: sirve para el botón "Buscar actualizaciones" */
    suspend fun check(): CheckResult {
        return try {
            val api = RetrofitClient.getApiService(context)
            val response = api.getAppVersion()
            if (!response.isSuccessful) {
                return CheckResult.Error("El servidor respondió ${response.code()}")
            }
            val body = response.body()
                ?: return CheckResult.Error("Respuesta vacía del servidor")

            if (body.available != true) {
                return CheckResult.UpToDate(BuildConfig.VERSION_NAME)
            }
            val remoteCode = body.versionCode
                ?: return CheckResult.Error("El servidor no informó la versión")

            Log.i(TAG, "Versión instalada: ${BuildConfig.VERSION_CODE} · publicada: $remoteCode")
            if (remoteCode <= BuildConfig.VERSION_CODE) {
                return CheckResult.UpToDate(BuildConfig.VERSION_NAME)
            }

            val base = BuildConfig.BASE_URL.trimEnd('/')
            CheckResult.Available(
                UpdateInfo(
                    versionCode = remoteCode,
                    versionName = body.versionName ?: remoteCode.toString(),
                    notes = body.notes,
                    fileSizeMb = body.fileSize?.let { it / (1024.0 * 1024.0) },
                    downloadUrl = base + (body.downloadUrl ?: "/api/mobile/app-download"),
                )
            )
        } catch (e: Exception) {
            Log.d(TAG, "Sin conexión o error consultando actualización: ${e.message}")
            CheckResult.Error("Sin conexión con el servidor")
        }
    }

    /** Versión instalada, para mostrarla en pantalla */
    fun currentVersionLabel(): String = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"

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
