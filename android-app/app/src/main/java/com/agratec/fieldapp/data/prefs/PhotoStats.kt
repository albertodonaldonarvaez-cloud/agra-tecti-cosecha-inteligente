package com.agratec.fieldapp.data.prefs

import android.content.Context
import com.agratec.fieldapp.util.ImageProcessor

/**
 * Cuánto se está comprimiendo: acumula, foto por foto, lo que pesaba al salir
 * de la cámara y lo que pesa ya lista para subir.
 *
 * Va en preferencias y no en la base de datos a propósito: la cámara puede
 * matar el proceso de la app justo después de la toma, y así el dato ya quedó
 * guardado antes de que eso pueda pasar. Además sobrevive aunque la foto se
 * borre del teléfono.
 */
object PhotoStats {

    private const val PREFS = "agra_photo_stats"
    private const val KEY_COUNT = "fotos"
    private const val KEY_ORIGINAL = "bytes_original"
    private const val KEY_FINAL = "bytes_final"

    data class Stats(val fotos: Int, val originalBytes: Long, val finalBytes: Long) {
        /** Porcentaje de peso que la app se ahorra de subir */
        val ahorroPct: Int
            get() = if (originalBytes > 0 && finalBytes in 0 until originalBytes)
                (100 - finalBytes * 100 / originalBytes).toInt() else 0

        val ahorroBytes: Long get() = (originalBytes - finalBytes).coerceAtLeast(0)
    }

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @Synchronized
    fun record(context: Context, result: ImageProcessor.Result) {
        if (result.originalBytes <= 0) return
        val p = prefs(context)
        p.edit()
            .putInt(KEY_COUNT, p.getInt(KEY_COUNT, 0) + 1)
            .putLong(KEY_ORIGINAL, p.getLong(KEY_ORIGINAL, 0) + result.originalBytes)
            .putLong(KEY_FINAL, p.getLong(KEY_FINAL, 0) + result.finalBytes)
            .apply()
    }

    fun read(context: Context): Stats {
        val p = prefs(context)
        return Stats(
            fotos = p.getInt(KEY_COUNT, 0),
            originalBytes = p.getLong(KEY_ORIGINAL, 0),
            finalBytes = p.getLong(KEY_FINAL, 0),
        )
    }

    fun reset(context: Context) {
        prefs(context).edit().clear().apply()
    }

    /** "12,4 MB" — para mostrarlo en pantalla */
    fun formatoMb(bytes: Long): String = when {
        bytes >= 1_000_000_000L -> String.format(java.util.Locale.getDefault(), "%.1f GB", bytes / 1_000_000_000.0)
        bytes >= 1_000_000L -> String.format(java.util.Locale.getDefault(), "%.1f MB", bytes / 1_000_000.0)
        bytes >= 1_000L -> "${bytes / 1_000} KB"
        else -> "$bytes B"
    }
}
