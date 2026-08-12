package com.agratec.fieldapp.util

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.util.Log
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream

/**
 * Procesa las fotos EN EL TELÉFONO antes de guardarlas y subirlas.
 *
 * POR QUÉ ESTOS NÚMEROS: el servidor, al recibir la foto, la vuelve a
 * redimensionar a 1920 px de lado mayor con calidad 80 antes de guardarla
 * (ver /api/sync/photo). Todo lo que el teléfono suba por encima de eso se
 * tira en el servidor: es ancho de banda del campo gastado a cambio de nada.
 * Por eso aquí se deja la foto EXACTAMENTE en el tamaño que el servidor va a
 * conservar; la evidencia guardada queda idéntica y se sube ~5 veces más rápido.
 *
 * En modo ahorro (señal mala) se baja a 1280 px y calidad 70.
 *
 * Si algo falla, la foto original se deja intacta: nunca se pierde evidencia.
 */
object ImageProcessor {

    private const val TAG = "ImageProcessor"

    /** Lado mayor que conserva el servidor */
    private const val MAX_EDGE = 1920

    /** Lado mayor en modo ahorro de datos */
    private const val MAX_EDGE_SAVER = 1280

    private const val JPEG_QUALITY = 80
    private const val JPEG_QUALITY_SAVER = 70

    /**
     * Tope duro por foto (~700 KB). Si tras comprimir sigue por encima se baja
     * la calidad por pasos: una sola foto pesada puede tumbar una sincronización
     * completa en una red de campo.
     */
    private const val TARGET_MAX_BYTES = 700_000L

    private const val MIN_QUALITY = 55

    /** Resultado de procesar una foto, con los números para poder reportarlos */
    data class Result(
        val originalBytes: Long,
        val finalBytes: Long,
        val width: Int,
        val height: Int,
        val quality: Int,
        val processed: Boolean,
    ) {
        /** Porcentaje de peso ahorrado (0 si no se pudo procesar) */
        val savedPct: Int
            get() = if (originalBytes > 0 && finalBytes in 1 until originalBytes)
                (100 - finalBytes * 100 / originalBytes).toInt() else 0
    }

    /**
     * Reescala y recomprime la foto sobre el mismo archivo.
     *
     * @param dataSaver true para el modo ahorro (fotos más ligeras)
     * @return los bytes antes y después; [Result.processed] es false si se dejó como estaba
     */
    fun compress(path: String, dataSaver: Boolean = false): Result {
        val file = File(path)
        val originalSize = if (file.exists()) file.length() else 0L
        val sinCambios = Result(originalSize, originalSize, 0, 0, 0, false)
        if (originalSize == 0L) return sinCambios

        val maxEdge = if (dataSaver) MAX_EDGE_SAVER else MAX_EDGE
        val baseQuality = if (dataSaver) JPEG_QUALITY_SAVER else JPEG_QUALITY

        return try {
            // 1. Leer solo dimensiones (sin cargar la imagen en memoria)
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(path, bounds)
            val srcW = bounds.outWidth
            val srcH = bounds.outHeight
            if (srcW <= 0 || srcH <= 0) return sinCambios

            // 2. Factor de reducción por potencias de 2 (lo que soporta el decoder)
            var sampleSize = 1
            while (maxOf(srcW / sampleSize, srcH / sampleSize) > maxEdge * 2) {
                sampleSize *= 2
            }

            val opts = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.ARGB_8888
            }
            var bitmap = BitmapFactory.decodeFile(path, opts) ?: return sinCambios

            // 3. Ajuste fino al lado mayor exacto
            val mayor = maxOf(bitmap.width, bitmap.height)
            if (mayor > maxEdge) {
                val scale = maxEdge.toDouble() / mayor.toDouble()
                val newW = (bitmap.width * scale).toInt().coerceAtLeast(1)
                val newH = (bitmap.height * scale).toInt().coerceAtLeast(1)
                val scaled = Bitmap.createScaledBitmap(bitmap, newW, newH, true)
                if (scaled != bitmap) bitmap.recycle()
                bitmap = scaled
            }

            // 4. Conservar la orientación de la cámara
            val rotation = readExifRotation(path)
            if (rotation != 0f) {
                val matrix = Matrix().apply { postRotate(rotation) }
                val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
                if (rotated != bitmap) bitmap.recycle()
                bitmap = rotated
            }

            // 5. Comprimir en memoria y bajar calidad hasta caber en el tope
            var quality = baseQuality
            var bytes = encode(bitmap, quality)
            while (bytes.size > TARGET_MAX_BYTES && quality > MIN_QUALITY) {
                quality -= 10
                bytes = encode(bitmap, quality)
            }

            val finalW = bitmap.width
            val finalH = bitmap.height
            bitmap.recycle()

            // Si recomprimir engordó el archivo (fotos ya muy ligeras), no tocarlo.
            // Solo cuando no había que girarla: si se deja el original, el giro
            // vive en el EXIF y el servidor lo descarta al guardar (saldría acostada).
            if (bytes.size >= originalSize && srcW <= maxEdge && srcH <= maxEdge && rotation == 0f) {
                Log.i(TAG, "Foto ya estaba optimizada (${originalSize / 1024} KB), se deja igual")
                return Result(originalSize, originalSize, srcW, srcH, 0, false)
            }

            FileOutputStream(file).use { out -> out.write(bytes) }
            val newSize = file.length()

            val result = Result(originalSize, newSize, finalW, finalH, quality, true)
            Log.i(
                TAG,
                "Foto ${srcW}x${srcH} → ${finalW}x${finalH} q$quality · " +
                    "${originalSize / 1024} KB → ${newSize / 1024} KB (${result.savedPct}% menos)",
            )
            result
        } catch (e: OutOfMemoryError) {
            Log.w(TAG, "Sin memoria para procesar la foto, se deja original", e)
            sinCambios
        } catch (e: Exception) {
            Log.w(TAG, "No se pudo procesar la foto, se deja original", e)
            sinCambios
        }
    }

    private fun encode(bitmap: Bitmap, quality: Int): ByteArray =
        ByteArrayOutputStream().also { bitmap.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()

    /** Compatibilidad con las llamadas antiguas que solo querían saber si se procesó */
    fun compressInPlace(path: String, dataSaver: Boolean = false): Boolean =
        compress(path, dataSaver).processed

    private fun readExifRotation(path: String): Float = try {
        when (ExifInterface(path).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> 0f
        }
    } catch (e: Exception) {
        0f
    }
}
