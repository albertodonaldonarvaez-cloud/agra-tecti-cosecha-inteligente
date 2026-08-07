package com.agratec.fieldapp.data.prefs

import android.content.Context

/**
 * Preferencias de sincronización de fotos con datos móviles.
 *
 * Los datos (actividades, notas, parcelas, colaboradores) SIEMPRE se sincronizan:
 * pesan poco. Las fotos son lo caro, así que el usuario decide qué pasa con ellas
 * cuando no hay WiFi.
 */
object SyncPreferences {

    private const val PREFS = "agra_sync_prefs"
    private const val KEY_UPLOAD_ON_MOBILE = "upload_photos_on_mobile"
    private const val KEY_DOWNLOAD_ON_MOBILE = "download_photos_on_mobile"
    private const val KEY_ASKED = "photo_policy_asked"

    /** ASK = todavía no se le pregunta al usuario */
    enum class Policy { ASK, ALLOW, WIFI_ONLY }

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun read(context: Context, key: String): Policy =
        when (prefs(context).getString(key, null)) {
            "allow" -> Policy.ALLOW
            "wifi_only" -> Policy.WIFI_ONLY
            else -> Policy.ASK
        }

    private fun write(context: Context, key: String, policy: Policy) {
        prefs(context).edit()
            .putString(key, if (policy == Policy.ALLOW) "allow" else "wifi_only")
            .apply()
    }

    /** ¿Subir fotos usando datos móviles? */
    fun uploadPolicy(context: Context): Policy = read(context, KEY_UPLOAD_ON_MOBILE)

    fun setUploadPolicy(context: Context, policy: Policy) = write(context, KEY_UPLOAD_ON_MOBILE, policy)

    /** ¿Descargar fotos del servidor usando datos móviles? */
    fun downloadPolicy(context: Context): Policy = read(context, KEY_DOWNLOAD_ON_MOBILE)

    fun setDownloadPolicy(context: Context, policy: Policy) = write(context, KEY_DOWNLOAD_ON_MOBILE, policy)

    /** ¿Ya se le preguntó al usuario alguna vez? (para no repetir el diálogo) */
    fun hasBeenAsked(context: Context): Boolean = prefs(context).getBoolean(KEY_ASKED, false)

    fun markAsked(context: Context) {
        prefs(context).edit().putBoolean(KEY_ASKED, true).apply()
    }

    /** Decide si se pueden SUBIR fotos con la red actual */
    fun canUploadPhotosNow(context: Context): Boolean {
        if (com.agratec.fieldapp.sync.NetworkUtils.isUnmetered(context)) return true
        return uploadPolicy(context) == Policy.ALLOW
    }

    /** Decide si se pueden BAJAR fotos con la red actual */
    fun canDownloadPhotosNow(context: Context): Boolean {
        if (com.agratec.fieldapp.sync.NetworkUtils.isUnmetered(context)) return true
        return downloadPolicy(context) == Policy.ALLOW
    }
}
