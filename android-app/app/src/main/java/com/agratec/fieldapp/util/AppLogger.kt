package com.agratec.fieldapp.util

import android.content.Context
import android.os.Build
import android.util.Log
import com.agratec.fieldapp.data.local.AppDatabase
import com.agratec.fieldapp.data.local.entity.AppLogEntity
import com.agratec.fieldapp.data.prefs.PhotoStats
import com.agratec.fieldapp.data.prefs.SyncPreferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID

/**
 * Bitácora de la app: deja constancia de quién entró, qué fotos tomó y qué
 * registró, para poder revisarlo después desde la web.
 *
 * Cómo funciona: el evento se guarda en el teléfono al instante (en el campo
 * casi nunca hay señal) y la sincronización lo sube por lotes. El servidor lo
 * guarda con el usuario de la sesión y marcado como "app", para distinguirlo
 * de lo que se hace en la web.
 *
 * Registrar NUNCA puede tumbar la app: todo va en un hilo aparte y cualquier
 * error se traga (una bitácora rota no vale una pantalla en blanco en el campo).
 */
object AppLogger {

    private const val TAG = "AppLogger"

    /** Tope local de eventos guardados: por si un teléfono pasa meses sin subir */
    private const val MAX_LOCAL_LOGS = 2000

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US)
        .apply { timeZone = TimeZone.getTimeZone("UTC") }

    // Acciones (deben existir en el ENUM del servidor)
    const val LOGIN = "login"
    const val LOGIN_FAILED = "login_failed"
    const val LOGOUT = "logout"
    const val APP_OPEN = "app_open"
    const val SCREEN_VIEW = "screen_view"
    const val PHOTO_CAPTURE = "photo_capture"
    const val PHOTO_UPLOAD = "photo_upload"
    const val NOTE_CREATE = "note_create"
    const val NOTE_STATUS = "note_status"
    const val ACTIVITY_CREATE = "activity_create"
    const val PERSON_CREATE = "person_create"
    const val PRODUCT_CREATE = "product_create"
    const val PRODUCT_UPDATE = "product_update"
    const val SYNC = "sync"
    const val ERROR = "error"

    /** Descripción del teléfono, para saber desde qué equipo se capturó */
    fun deviceName(): String = "${Build.MANUFACTURER} ${Build.MODEL} · Android ${Build.VERSION.RELEASE}"

    /**
     * Registrar un evento. Devuelve de inmediato: la escritura va en otro hilo.
     */
    fun log(
        context: Context,
        action: String,
        screen: String? = null,
        detail: String? = null,
        originalBytes: Long? = null,
        finalBytes: Long? = null,
        durationSeconds: Int? = null,
    ) {
        val app = context.applicationContext
        scope.launch {
            try {
                val dao = AppDatabase.getInstance(app).appLogDao()
                dao.insert(
                    AppLogEntity(
                        clientLogId = UUID.randomUUID().toString(),
                        action = action,
                        screen = screen?.take(128),
                        detail = detail?.take(500),
                        originalBytes = originalBytes,
                        finalBytes = finalBytes,
                        durationSeconds = durationSeconds,
                        occurredAt = iso.format(Date()),
                    )
                )
                if (dao.total() > MAX_LOCAL_LOGS) dao.trimTo(MAX_LOCAL_LOGS)
            } catch (e: Exception) {
                Log.w(TAG, "No se pudo registrar el evento $action", e)
            }
        }
    }

    /**
     * Comprime la foto recién tomada y deja constancia de cuánto se ahorró.
     *
     * Es EL punto por el que pasan todas las fotos de la app: así el ahorro de
     * datos siempre queda medido y nunca se olvida registrarlo en un flujo nuevo.
     * Devuelve el resultado por si la pantalla quiere mostrarlo.
     */
    suspend fun captureAndLog(context: Context, path: String, screen: String, extra: String? = null): ImageProcessor.Result =
        withContext(Dispatchers.IO) {
            val result = ImageProcessor.compress(path, dataSaver = SyncPreferences.dataSaver(context))
            logPhoto(context, screen, result, extra)
            result
        }

    /** Atajo para las fotos: deja el ahorro de peso en el propio evento y en el acumulado */
    fun logPhoto(context: Context, screen: String, result: ImageProcessor.Result, extra: String? = null) {
        PhotoStats.record(context.applicationContext, result)
        val detalle = buildString {
            append(if (result.processed) "Foto comprimida" else "Foto sin comprimir")
            if (result.width > 0) append(" · ${result.width}×${result.height}")
            append(" · ${result.originalBytes / 1024} KB → ${result.finalBytes / 1024} KB")
            if (result.savedPct > 0) append(" (${result.savedPct}% menos)")
            if (!extra.isNullOrBlank()) append(" · $extra")
        }
        log(
            context = context,
            action = PHOTO_CAPTURE,
            screen = screen,
            detail = detalle,
            originalBytes = result.originalBytes,
            finalBytes = result.finalBytes,
        )
    }
}
