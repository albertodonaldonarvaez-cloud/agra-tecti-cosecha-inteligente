package com.agratec.fieldapp.sync

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Resultado de la última sincronización, para que la app pueda DECIRLE al usuario
 * qué pasó (antes fallaba en silencio y no había forma de saber por qué).
 */
object SyncStatus {

    private const val PREFS = "agra_sync_status"
    private const val KEY_MESSAGE = "last_message"
    private const val KEY_OK = "last_ok"
    private const val KEY_AT = "last_at"
    private const val KEY_PENDING_PHOTOS = "photos_waiting_wifi"

    data class Status(
        val message: String,
        val ok: Boolean,
        val at: String,
        /** Fotos que esperan WiFi (o permiso del usuario) para subirse */
        val photosWaitingForWifi: Int,
    )

    private val _state = MutableStateFlow<Status?>(null)
    val state: StateFlow<Status?> = _state

    fun record(context: Context, message: String, ok: Boolean, photosWaitingForWifi: Int = 0) {
        val at = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_MESSAGE, message)
            .putBoolean(KEY_OK, ok)
            .putString(KEY_AT, at)
            .putInt(KEY_PENDING_PHOTOS, photosWaitingForWifi)
            .apply()
        _state.value = Status(message, ok, at, photosWaitingForWifi)
    }

    fun load(context: Context): Status? {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val message = p.getString(KEY_MESSAGE, null) ?: return null
        val status = Status(
            message = message,
            ok = p.getBoolean(KEY_OK, true),
            at = p.getString(KEY_AT, "") ?: "",
            photosWaitingForWifi = p.getInt(KEY_PENDING_PHOTOS, 0),
        )
        _state.value = status
        return status
    }
}
